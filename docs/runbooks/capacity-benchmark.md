# Isolated pilot capacity benchmark

This harness measures a modest PocketBase pilot workload, using the repository's
actual migrations and hooks. A passing run establishes correctness for that
short local scenario only. It does not establish nationwide capacity or an SLA.

Run from the repository root with the existing Node 24 dependencies:

```bash
./node_modules/.bin/tsx scripts/capacity-benchmark.ts
```

The local `backend/pocketbase` must report exactly `pocketbase version
0.39.6`. If it does not, the harness fails before starting a server or creating
any data. An existing verified binary can be selected without downloading or
modifying dependencies:

```bash
CAPACITY_PB_BIN=/absolute/path/to/pocketbase ./node_modules/.bin/tsx scripts/capacity-benchmark.ts
```

There are no CLI flags, external URL overrides, database reuse options, or
keep-running options. The sole override is `CAPACITY_PB_BIN`. The harness binds
only `127.0.0.1:8098`, refuses a busy port, and creates a unique
`ltv-capacity-*` directory under the operating system's temporary directory.
It runs migrations, creates a disposable superuser, and serves with the actual
`backend/pb_hooks` and `backend/pb_migrations` directories. It does not use
production, `/tmp/ltv-ratings-qa`, or the user servers on ports 3100/8095.
Finally it closes SSE connections, stops only its own process (TERM, with a
bounded KILL fallback), and deletes only its new temporary directory. SIGINT
and SIGTERM cancel in-flight requests through the same cleanup path. A forced
process/machine kill cannot run JavaScript cleanup.

## Fixed workload

- Five active dealers, each with one admin and one sales user: ten distinct
  authenticated sessions. Ten password authentications are measured separately.
- Seed 200 synthetic inventory records per dealer (1,000 total). No real
  customer information, uploaded documents, external API keys, or paid AI calls.
- Warm one inventory page per session and open ten authenticated inventory SSE
  subscriptions, one per session.
- Run ten concurrent sequential workers, each for 20 rounds. Every round lists
  up to 200 inventory records, creates a unit, updates its price, creates a saved
  deal, updates its status/down payment, then reads the saved deal back.
- Inventory writes use the dealer admin identity, including for the sales
  worker, because inventory import is admin-scoped. Saved-deal actions use each
  worker's own identity. These are API import-like writes, not a browser CSV
  parsing or whole-inventory replacement benchmark.
- The measured workload is 1,200 HTTP requests: 200 each for inventory list,
  inventory create/update, and saved-deal create/update/read. There is no think
  time. Authentication, seed, warmup, subscription setup, denial probes, and
  final checks are excluded from workload throughput.

## Assertions and receipt

The script exits zero only after the full workload and integrity checks pass.
It emits a JSON success receipt to stdout and brief phase messages to stderr.
The receipt contains per-operation count and nearest-rank p50/p95/p99 latency,
workload duration/throughput, errors, counts, host information, and resource
observations. Failures exit nonzero and emit a JSON failure receipt with partial
latencies, errors, phase/count progress, resource observations, and host load.
A failed assertion is an integrity failure; the `errors` field counts failed
measured operations, so it can be zero on a seed or integrity failure.

Final assertions check:

- Exactly 240 inventory records and 40 saved deals per dealer (1,200 / 200
  total), unique stock numbers, updated price/status/down payment, and correct
  saved-deal ownership/dealer attribution.
- Every inventory page belongs to its session's dealer. Sales responses and
  sales SSE payloads omit unit cost.
- Each session receives exactly one create and update event for every new
  inventory record in its dealer, with no foreign dealer payloads. The expected
  total is 800 SSE events. SSE p50/p95/p99 measure mutation-request start to
  receipt in the subscribing Node process, not latency from database commit.
- Eight cross-dealer denial probes per session (80 total): GET, PATCH, DELETE,
  and filtered list for both inventory and saved deals. Direct foreign records
  must return 404; foreign lists must contain zero records. Final persistence
  checks follow the probes to detect any successful mutation.

Each HTTP request has a 15-second timeout. SSE handshake timeout is five seconds;
final event reconciliation waits up to five seconds. Unexpected SSE stream
errors fail the integrity gate. Resource sampling uses asynchronous `ps` once
per second with at most one sample in flight; it does not block the workload.
RSS and CPU are observed samples, not hard resource limits. CPU interpretation
is the host `ps` convention; `data.db` bytes exclude WAL and auxiliary files.

## October 8, 2026 local attempts

Capacity is **not established**. The repository binary reported 0.23.4, so the
attempts used an already cached binary reporting 0.39.6:

```bash
CAPACITY_PB_BIN=/tmp/pb-download-1791309786647/pocketbase ./node_modules/.bin/tsx scripts/capacity-benchmark.ts
```

The first attempt seeded 1,000 units and entered the ten-session workload but
failed on a 15-second request timeout. The contemporaneous host load average
was 407.06 / 402.04 / 328.62. Partial workload percentiles were not retained by
that initial harness revision. A manual observation of the owned PocketBase
process showed approximately 390 MiB RSS; this is not a benchmark resource peak.

A second attempt was deliberately stopped before the measured workload because
the host remained severely contended. Its ten sequential seed-time
password-authentication measurements were p50 888.43 ms and p95/p99 6,304.17 ms;
those ten samples cannot characterize sustained login capacity. The failed
receipt reported host load 458.63 / 426.20 / 352.29 and `fetch failed` following
termination of the owned backend. Both attempts cleaned up their owned server
and temporary data. The aggregate failure receipt is local-only at
`/tmp/ltv-capacity-failed-host-receipt.json`; it contains no synthetic records.

After these attempts, the harness gained partial-result reporting, asynchronous
resource sampling, SSE latency/error assertions, saved-deal denial probes, and
signal cancellation. The final harness has not completed a full passing run.
Execute it on an idle dedicated runner and retain its full JSON receipt before
using any result for a pilot decision. Do not raise timeouts to hide failures.

## Remaining capacity gates

A local macOS machine and short API run are not Fly's configured 1 vCPU / 1 GiB
instance. Repeat this exact workload on a disposable instance matching the
production resource limits, then run sustained and burst tests with realistic
inventory/deal sizes, slower networks, reconnects, large imports, backup
replication, and failure/recovery behavior. This run does not exercise browser
rendering, frontend AI routes, real paid inference, file uploads, Litestream,
production network/region latency, long-lived retention growth, or concurrent
updates to the same saved deal. The largest latency sample set per HTTP class is
200; authentication has only ten samples. These measurements support bounded
pilot evaluation, not a national SLA.
