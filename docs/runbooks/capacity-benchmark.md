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
keep-running options for the native CLI. Its sole override is `CAPACITY_PB_BIN`. The harness binds
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

The native script exits zero only after the full workload and integrity checks
pass. Its exported `runBenchmark(launcher)` runs the same fixed workload for an
owned process launcher and returns a receipt after cleanup; importing the module
does not start a server, print a receipt, or install signal handlers. Launchers
provide version/preparation/start/readiness/stop and optional resource/finalization
hooks. Supplemental evidence is nested under `launcher.supplemental`. A launcher
without a process resource sampler leaves native RSS/CPU observations empty;
Docker client RSS must not be presented as backend memory. Hard container limits,
aggregate cgroup peak/OOM evidence, and replica checks belong in supplemental
evidence. Launcher cleanup failure makes the receipt fail and preserves its
temporary directory rather than deleting data under a possibly live server.
It emits a JSON success receipt to stdout and brief phase messages to stderr.
Native success and failure receipts include `runtimeSettings`: PocketBase uses
`GOMEMLIMIT=512MiB`, `GOMAXPROCS=1`, and default (unset) `GOGC`. The sanitized
child environment explicitly supplies these settings rather than inheriting
provider credentials or arbitrary Go tuning from the caller. `GOMAXPROCS=1`
limits Go execution parallelism; it does not enforce a hard CPU quota.

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
signal cancellation.

## October 8, 2026 native CI receipt and memory candidate

CI run `37846688236` for source HEAD `a1449df` completed the workload: 1,200
requests, 800 SSE events, and 80 cross-dealer denial probes passed with zero
measured errors. The workload took 16.303 seconds (73.61 requests/second).
Inventory-list p50/p95/p99 were 583.98 / 840.27 / 945.14 ms; the other HTTP
classes' p95 values ranged from 64.42 to 110.19 ms. These are bounded native
runner results, not production latency guarantees.

The Linux runner had four logical CPUs and 15.6 GiB RAM. PocketBase's observed
peak RSS was **1,088.4 MiB**, exceeding Fly's configured **1 GiB total machine
budget**, and observed CPU reached 315%. Litestream was not part of this
workload. This successful integrity run does not establish capacity on the
configured one shared CPU / 1 GiB production machine. The downloaded receipt is
at `Documents/Codex/2026-10-08/ltv-launch-review/continuation/ci-operational-receipts/ltv-capacity-receipt.json`
on the review host.

The next candidate explicitly gives PocketBase `GOMEMLIMIT=512MiB` in both
production `start.sh` launch paths and in this harness. The production setting
applies to PocketBase alone, leaving Litestream's environment unchanged. Keep
`GOGC` at its default. PocketBase recommends a Go memory limit for constrained
machines; it is a soft GC target and can be exceeded, so it is not a substitute
for measuring total machine memory. [PocketBase production guidance](https://pocketbase.io/docs/going-to-production/),
[Go GC guidance](https://go.dev/doc/gc-guide).

The harness additionally sets `GOMAXPROCS=1` for the comparison with a one-CPU
budget; this setting is not added to production startup by this change. Retain the current revision's native and constrained receipts to evaluate this candidate.
Do not reuse the unconstrained native receipt as evidence for the candidate.
Do not raise timeouts to hide failures.

## Linux CI container comparison

The workflow builds `backend/Dockerfile` as `ltv-capacity:ci`, then runs:

```bash
CAPACITY_CONTAINER_IMAGE=ltv-capacity:ci ./node_modules/.bin/tsx scripts/capacity-container-benchmark.ts
```

The CLI requires Linux with `CI=true`, an explicitly built local image, and
Docker's local Unix socket. It refuses remote Docker/context overrides and a
busy port before any probe containers. It verifies PocketBase 0.39.6,
Litestream 0.5.14, the image ID and production startup command. Every created
container has a unique run label/name; cleanup verifies that ownership before
removing it, including unknown version-probe or create outcomes.

The same 1,200-request / 800-event / 80-denial workload uses the actual startup
script with a synthetic local-file Litestream replica. Hard limits are one CPU,
1 GiB RAM, no swap and no automatic restart. The container leaves `GOMAXPROCS`
automatic/unset, matching the startup configuration; the native comparison uses
its explicit one-worker setting. Container receipt settings distinguish
PocketBase from Litestream and include observations from the live processes.

Acceptance requires complete cgroup v2 evidence, zero OOM events/kills/restarts,
matching hard limits, and aggregate peak memory at or below 768 MiB. This
explicit engineering budget leaves 25% headroom below the container memory
limit; it is not an empirically established nationwide user cap. Peak memory
covers startup, migrations/seed, workload, replication/restore verification,
local file cache and a 20-second idle period. The Node load client runs outside
the container. Native process RSS is absent for this launcher, so Docker-client
memory cannot be mistaken for backend memory.

The daemon must confirm the local replica's transaction ID, and a restored
synthetic database must pass Litestream's full integrity check. The receipt
contains aggregate counters and image identity; CI uploads that receipt without
databases, replicas or credentials. File replication exercises the combined
processes but does not establish R2 delivery, network backup lag or durability.

## Remaining capacity gates

A local macOS machine and short API run are not Fly's configured 1 vCPU / 1 GiB
instance. Repeat this exact workload on a disposable instance matching the
production resource limits. A disposable Linux container should enforce one
CPU, 1 GiB RAM, and no additional swap (`--cpus=1 --memory=1g --memory-swap=1g`),
with the load client outside that budget. Verify aggregate cgroup memory peak
and OOM events for PocketBase plus Litestream, including startup/seed and
post-workload idle; `ps` samples of PocketBase alone cannot verify that budget.
Use an isolated synthetic replica, require the same integrity assertions and
zero timeouts/OOM/restarts, and retain the full latency/resource receipt. Then
run sustained and burst tests with realistic
inventory/deal sizes, slower networks, reconnects, large imports, backup
replication, and failure/recovery behavior. Neither mode exercises browser
rendering, frontend AI routes, real paid inference, file uploads, remote backup delivery,
production network/region latency, long-lived retention growth, or concurrent
updates to the same saved deal. The largest latency sample set per HTTP class is
200; authentication has only ten samples. These measurements support bounded
pilot evaluation, not a national SLA.
