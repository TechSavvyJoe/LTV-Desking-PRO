# Operational readiness for additional dealerships

Reviewed 2026-10-08 against repository configuration. This document records
operational gates, not a production acceptance receipt or an uptime promise.
The current Pilot Charter describes a Michigan companion-tool pilot with
business-hours support and no uptime SLA. Nationwide operation needs an
explicit support/capacity envelope in addition to state-specific product
validation covered by the launch review.

## Enforced release behavior

- `check.yml` runs format/types/lint/unit/coverage/build/audit, with seeded
  real-PocketBase E2E for PRs and main. Functional E2E is not a load test.
- `deploy-backend-fly.yml` requires the current main SHA and a successful
  main-push Verification run. It validates migrations and schema on an empty
  database and proves a second boot, snapshots the active production volume,
  requires exactly one machine, then deploys that SHA and checks API/process
  health. This does not test migration compatibility against a production
  database copy, prove remote backup freshness, or prove the running backend
  image equals the SHA using an application release endpoint.
- Vercel deployment is chained after Fly succeeds. It stages a production
  build, waits for READY, promotes it, then checks the alias deployment ID,
  homepage, and `/api/ai/models`. It does not run authenticated deal-save or
  AI-extraction smoke tests against the staged deployment before promotion.
- Fly runs one shared vCPU / 1 GB machine with a 1 GB volume in `ord`.
  PocketBase is pinned at 0.39.6 and Litestream at 0.5.14 with download hashes.
  Horizontal machine scaling is blocked by the release workflow. This is
  intentional: independent SQLite volumes would be separate writers.
- Missing R2 configuration and missing-database restore failures fail closed.
  `ALLOW_NO_BACKUP` and `ALLOW_FRESH_DB` remain explicit emergency/bootstrap
  bypasses. A restore candidate is published only after a successful integrity
  check. Replication errors can still retry while the API is healthy.

## Evidence required before expanding the pilot

| Gate             | Required receipt                                                                                                                | Current repository evidence                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Release identity | main SHA, successful Verification/release runs, Fly image and Vercel deployment IDs; exact-route smoke results                  | Workflow enforcement exists; no new production release was performed during this audit                                   |
| Recovery         | Read-only R2 restore with transaction/time, integrity result, expected tenant counts; replacement drill RPO/RTO                 | Safe runbooks exist; the audit did not access backups or execute a live drill                                            |
| Uploaded files   | Verified restore of dealer logos/local files, or explicit accepted file-loss scope                                              | R2 replicates only `data.db`; Fly snapshots cover volume contents                                                        |
| Alert delivery   | External frontend/PB monitors, backup freshness monitor, named responder, delivered test alert                                  | Alerting runbook says nothing pages; code configuration alone cannot establish monitor activation                        |
| Capacity         | Concurrent import/save/read/SSE workload at declared tenant/user envelope; p95/p99 latency, errors, memory, disk and backup lag | No multi-dealer load benchmark or supported capacity bound is recorded                                                   |
| Upgrade/rollback | Version changelog review, production-shape database rehearsal, hook/rule tests, restore and rollback rehearsal                  | Fresh-db/idempotency checks exist; image rollback does not undo database migrations                                      |
| User lifecycle   | Authorized-admin onboarding, reset-email delivery, deactivation with an existing token, recovery/support receipt                | Admin provisioning and dealer/user active gates exist; SMTP operation is externally configured and unverified            |
| Cancellation     | Frozen complete export, verified hashes/counts, explicit deletion receipt, all backup/copy expiry evidence                      | Paginated read-only export tool exists; deletion and retention execution remain separate operator actions                |
| Commercial terms | Executed pilot agreement, support contact/response envelope, fees/user cap, retention responsibilities                          | Draft agreement uses direct invoicing; no software billing, license tier, seat cap or renewal enforcement is implemented |

## Bounded engineering follow-ups

1. Add a sanitized production-shape upgrade rehearsal in CI, with explicit
   allowed old-version/schema fixtures and migration data-preservation checks.
   Do not import real customer data into CI fixtures.
2. Add backend release identity and readiness reporting without exposing
   private configuration. Keep `/api/health` as API liveness; monitor successful
   remote backup sync independently. Test remote-write denial and delivered
   freshness alerts in an isolated environment.
3. Add an isolated reproducible capacity benchmark and record the supported
   envelope before increasing stores. Vertical scaling follows measurements;
   another machine requires a reviewed replication/failover design.
4. Keep offboarding deletion as a separately reviewed operation. Implement
   dry-run retention reporting for saved deals, deal events and audit logs;
   the written quarterly purge currently only specifies saved deals.
5. Establish a PocketBase/Litestream version owner and changelog review
   cadence. Update all binary/hash pins together, then rehearse migration,
   hooks, quotas and recovery. Do not auto-upgrade from the current pin merely
   because newer documentation exists.

## Primary sources

Sources accessed 2026-10-08. These describe platform behavior, not proof that
this application's external services are configured or a commercial account
has an appropriate plan.

- [PocketBase introduction](https://pocketbase.io/docs/): currently identifies
  0.40.4, warns pre-1.0 backward compatibility is not guaranteed, and requires
  changelog/manual migration ownership for production-critical use.
- [PocketBase production guidance](https://pocketbase.io/docs/going-to-production/):
  recommends SMTP and rate limiting; full backups include local uploaded files.
  Application AI quotas do not prove general auth/API limits are configured.
- [Fly volume overview](https://docs.fly.io/volumes/overview): volumes are local
  to one server, one per machine, and do not replicate automatically. Single
  machine deployments/host failures cause downtime; snapshots are secondary
  backups.
- [Litestream 0.5.14 restore source](https://github.com/benbjohnson/litestream/blob/v0.5.14/replica.go#L699-L710):
  output is renamed before checking integrity and may remain after cancellation.
- [Litestream 0.5.14 replication monitor](https://github.com/benbjohnson/litestream/blob/v0.5.14/replica.go#L325-L450):
  remote failures log and retry with backoff rather than guaranteeing process exit.
- [Litestream configuration](https://litestream.io/reference/config/): retention,
  validation and heartbeat configuration are distinct controls.
- [Vercel function limits](https://vercel.com/docs/functions/limitations): body
  size and duration depend on platform limits/compute settings. Confirm actual
  account configuration and exercise representative lender documents.

No infrastructure, subscription, payment processor, monitoring service or
production deployment was changed by this audit.
