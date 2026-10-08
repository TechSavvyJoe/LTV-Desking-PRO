# Launch review and engineering handoff

Reviewed 2026-10-08, starting from `007134a` on `codex/deal-sheet-polish`, with the accompanying changes prepared for PR #27. The initial desking-repair receipt below applies to `340ec2f`; later operational additions are recorded under Engineering continuation and verified against the PR's current SHA. No production deployment or nationwide acceptance is asserted.

**Decision:** the independent final reviewer accepts the reviewed code for a bounded Michigan retail-finance companion pilot. Nationwide commercial launch remains blocked by the evidence gates below. No review can establish that every possible defect is absent.

## Completed repairs

| Area                          | Result                                                                                                                                                                                                                                                                            | Verification                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shared workstations           | Private storage, queries and mounted drafts reset across identity, role, dealer and owner-override changes. A monotonic session epoch prevents delayed responses or old setters from refilling a new session, including A→B→A. Same-identity refresh preserves the current draft. | Unit deferred-response tests and real-backend manager/sales/401 session tests.                                                          |
| AI privacy                    | Gemini project logging opt-out reaches the actual serialized request through SDK `extraBody`. Documentation distinguishes this from provider abuse-monitoring retention.                                                                                                          | Wire-level mocked fetch tests for PDF, structured JSON and grounded paths; no paid live inference.                                      |
| Program matching              | Known base rate plus adder is enforced as a floor; future/malformed effective dates and missing financed amounts stay pending. Sales receive a safe manager-review signal when private rates are redacted.                                                                        | Finance edge tests and actual PocketBase field serialization/role tests.                                                                |
| Program source review         | Imports and financial edits invalidate source review. Admins record document/version and a review timestamp; supplied expiration dates are inclusive and enforced. Blank expiration remains unknown. First-run setup excludes drafts and expired programs.                        | Import/editor/helper tests and persisted source-review browser workflow.                                                                |
| Mixed inventory               | Explicit new/used/certified status persists per VIN. Manual overrides and restored legacy conditions are scoped to their VIN. Missing feed status does not invent condition or overwrite an existing confirmation; clearing a confirmation persists as unknown.                   | Mixed-lot calculator/matcher/scoring tests, importer/API tests and actual admin edit/reload test.                                       |
| Deal saving                   | Immediate duplicate-activation guard, visible busy controls, deduplicated results and dirty-state protection when inputs change during a save. Invalid worksheet saves keep the editor open. Scratch-pad edits mark a focused deal dirty.                                         | Held-response single-write browser workflow and hook/editor tests.                                                                      |
| Pipeline                      | Search customer, salesperson, unit, VIN and lender; filter exact statuses and clear empty results. Status updates are guarded per deal and explicitly labelled dealer-entered.                                                                                                    | Component tests and actual status persistence/search workflow. No lender submission is implied.                                         |
| Payment labels and worksheets | Desk, defaults, charts, pipeline and PDFs identify the entered interest rate. Equal monthly nominal-rate estimates remain distinct from fee/timing-adjusted disclosure APR. The earlier two-page worksheet and scroll repairs are retained.                                       | Default-timeout unit suite, Chromium/WebKit PDF downloads and long-content PDF checks.                                                  |
| Recovery                      | Interrupted Litestream output stays a candidate until a successful integrity-checked restore; a subsequent boot cannot trust a cancelled candidate. Process uptime is no longer described as proof of remote backup freshness.                                                    | Isolated shell harness, including a two-boot cancelled-restore scenario.                                                                |
| Dealer exit                   | Paginated, explicitly scoped, read-only export with count guards, private file permissions and hash receipt; no automatic deletion.                                                                                                                                               | Export tests include pagination, access, failure cleanup and refusal to overwrite. Attachments require separate backup/export handling. |

The source-review timestamp records a dealer action; it does not prove document authenticity. Existing legacy non-sample programs have not received fabricated provenance. Source snapshots, reviewer/version history, authoritative guide/options evidence and actual lender decisions remain distinct requirements.

## Initial desking-repair verification receipt

Environment: macOS arm64, Node 24.20.0, Playwright 1.61.1. Initial local browser tests used disposable seeded dealerships on port 8096 with the frontend on 3101; manual inspection used the existing synthetic local workspace on 3100. A continuation discovered that the local seed helper silently accepted an older PocketBase 0.23.4 binary. The initial local runtime was incorrectly recorded as 0.39.6 here. GitHub's successful real-backend suite at `340ec2f` used the deployment-pinned 0.39.6 binary. The helper now verifies the exact runtime before any fixture database reset. No production customer records or lender documents were placed in fixtures.

| Check                                      | Result                                                                                                                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit suite, default 15-second test timeout | **802 passed in 65 files**                                                                                                                                                                                                              |
| Coverage                                   | **74.89% lines, 73.02% statements, 66.30% branches, 65.27% functions**; all repository thresholds passed                                                                                                                                |
| Types, lint, production build, format      | **Passed**, final command chain exited 0                                                                                                                                                                                                |
| npm dependency audit                       | **0 vulnerabilities**; local audit used an empty user config to avoid an unrelated global npm `allow-scripts` configuration error, without changing user settings                                                                       |
| Real-backend browser suite                 | **67 passed, 2 intentional mocked-login skips**, 3.8 minutes; Chromium full suite plus four WebKit smoke tests                                                                                                                          |
| Accessibility                              | Automated axe checks in both themes passed the configured serious/critical gate. This is not a complete manual WCAG certification.                                                                                                      |
| Database changes                           | Fresh migrations passed. A populated synthetic database on the previous schema upgraded twice with SQLite integrity `ok`; cents, zero mileage and tier JSON/zero rate were preserved. This is not a production-shape restore rehearsal. |
| Independent final code gate                | **Accepted for bounded Michigan companion-pilot handoff**; the earlier stale async cache-write finding was fixed and re-reviewed                                                                                                        |

Early new browser failures were test setup defects: a mobile drawer needed opening, its close action needed dialog scope, a toast needed alert scope, and a raw PocketBase fixture needed explicit optional limits. Corrections retained the tested assertions. One focused integration run timed out on a heavily loaded host; the final entire suite passed with the normal timeout.

Local receipts and screenshots are under `Documents/Codex/2026-10-08/ltv-launch-review`; detailed logs remain in `/tmp/ltv-launch-complete-*.log`. CI is tracked on [PR #27](https://github.com/TechSavvyJoe/LTV-Desking-PRO/pull/27); use its current SHA/checks before merging. These local results do not confirm production state.

The standard security review is scan `a2ecdd9d-f997-4c4e-89d6-081ca4287885`, bound to the original HEAD. It found two medium-severity boundary defects whose fixes are included here. Its canonical report explicitly records partial coverage; neither that scan nor this handoff claims every tracked file was fully audited. The final deferred-response repair also strengthens that session boundary.

## Engineering continuation

- The seed helper now refuses a mismatched PocketBase runtime before resetting
  fixture data, verifies downloaded archive hashes, preserves existing binaries,
  and uses argument-array subprocess calls. Exported seed functions can be
  imported without starting the CLI. Deployment pins were not upgraded.
- A native full ZIP backup/recovery rehearsal on 0.39.6 restored two tenants,
  their records and both uploaded logos with exact content hashes, tenant denial
  checks and SQLite integrity `ok`. The local fixture restored to ready in
  5.095 seconds. The later CI fixture restored to ready in 1.152 seconds and
  passed the retention report, access checks and file hashes; this is not
  production RPO/RTO or off-host backup evidence.
  See [the rehearsal runbook](runbooks/backup-rehearsal.md).
- A five-dealer, ten-session backend workload checks 1,200 CRUD/list requests,
  800 inventory SSE events and 80 cross-dealer denial probes. An overloaded Mac
  attempt timed out; no capacity bound follows from it. The final harness at
  `a1449df` passed all requests/events/probes with zero errors in CI, but the
  backend reached 1,088.4 MiB RSS and 315% CPU on a four-CPU/15.6-GiB runner.
  That exceeds the configured Fly memory budget before accounting for
  Litestream or the operating system. Workload integrity passed; the proposed
  five-dealer capacity envelope remains unaccepted. Production-resource and
  sustained-load evidence remain required. See [the workload definition](runbooks/capacity-benchmark.md).
- [Read-only retention reporting](runbooks/retention-review.md) adds aggregate
  saved-deal/event age visibility and explicitly opted-in global audit counts,
  with no customer payloads or disposal actions. Missing/invalid dates require
  review; live pagination is not a transactional deletion manifest.

The [continuation CI run](https://github.com/TechSavvyJoe/LTV-Desking-PRO/actions/runs/37846688236)
at source head `a1449df` passed 818 unit tests in 68 files, 67 browser tests
(two intentional mocked-login skips), formatting, type-check, lint, build,
coverage, audit and both operational drills. The recovery receipt's `cede514`
is GitHub's generated PR merge checkout, rather than the source branch head.
An independent continuation review found no merge-blocking tooling defect but
rejected using that unconstrained workload as a production capacity claim.

The operational receipts are fixture evidence. R2 delivery/freshness, restored
production files, real capacity and commercial/jurisdiction gates remain open.

## Meaningful numbers

A readiness value of 83 means ten of twelve configured checks passed, rounded; it is not an 83% approval chance. Data completeness counts resolved checks, including failures. Budget usage and dollar headroom use the entered ceiling. PTI/DTI use entered gross income and monthly obligations. Estimated gross requires confirmed costs, products and reserve; missing costs stay unknown. A 3/3 lender-match display has three fully checked programs, while pending programs are shown separately rather than hidden in the denominator. See [the model card](MODEL_CARD.md) and [rating definitions](desking/deal-ratings.md).

The synthetic rules benchmark measures one local inventory×program evaluation, not whole-app concurrency or server capacity. Its 25-trial p95 ranged from roughly one second for 250 units to 9.5 seconds for 5,000 units on a loaded workstation. High variance and limited synthetic tiers prevent a nationwide capacity claim. The reproducible script is `scripts/benchmark-rules.ts`.

## National launch gates

1. **Jurisdiction and transaction scope:** verified dealer/delivery/state/local tax and fee rules, product taxation, exemptions and supported transaction types. Current calculations model a Michigan dealer with five modeled buyer states. Unsupported national contracts cannot be treated as accurate through a single custom rate.
2. **Authoritative finance evidence:** actual dealership lender sheets, source/guide/version history, advance-basis fixtures, and independently reconciled funded deals. No source sheets were supplied, so samples remain illustrative. Pilot targets are prospective rather than achieved outcomes.
3. **Production protection and operations:** confirmed MFA/equivalent approved controls, encryption and provider data terms; SMTP/recovery and existing-token deactivation receipts; tested restore including uploaded files; delivered backup-freshness/outage alerts; named support/incident owners. Source controls do not establish live service configuration.
4. **Scale and change safety:** concurrent multi-dealer import/save/read/SSE/AI load at a declared user envelope, latency/errors/memory/disk/backup lag, production-shape upgrade and rollback rehearsal. The single-writer SQLite architecture has no demonstrated national capacity or availability SLA.
5. **Commercial and lifecycle readiness:** executed dealer/service-provider agreements, approved internal-vs-consumer use, support and retention responsibilities, billing/seat policy, complete cancellation export and reviewed deletion/backup-expiry procedures. This review does not establish contracts, willingness to pay or product-market fit.

The detailed feature comparison and acceptance criteria are in [the product review](NATIONWIDE_PRODUCT_REVIEW_2026-10-08.md); infrastructure receipts are in [operational readiness](NATIONWIDE_READINESS.md). Official competitor descriptions include [Reynolds Desking](https://www.reyrey.com/solutions/desking/desking) and [DealerCenter I-MAXX](https://support.dealercenter.net/hc/en-us/articles/360001202043-Using-I-MAXX-Instantly-structure-approvals-on-all-vehicles-in-your-inventory). These are advertised capabilities, not independent quality measurements. [FTC dealer Safeguards guidance](https://www.ftc.gov/business-guidance/resources/automobile-dealers-ftcs-safeguards-rule-frequently-asked-questions) informs the protection gates; automated tests do not establish compliance. [CFPB rate/APR guidance](https://www.consumerfinance.gov/ask-cfpb/what-is-the-difference-between-a-loan-interest-rate-and-the-apr-en-733/) supports the estimate distinction. Other primary sources and fetch limits are recorded in the specialist reviews.

## Review team and ownership

Seven specialist lanes were used, with three specialists at once: product/finance, operations, security, independent security, vehicle evidence, browser quality and final release critique. Five used **GPT-6.1 Sol/high**, browser quality used **GPT-6 Luna/medium**, and the independent final gate used **GPT-6 Astra/high**. An additional **GPT-6 Luna/medium** specialist checked the surviving handoff receipts and document links after the app restart. Daybreak was unavailable; it was not represented as the executing security reviewer. Root integrated the changes and executed final checks. The roles used product-analysis, frontend-testing and security-audit skill instructions where applicable.

The continuation used two additional specialists: **GPT-6.1 Sol/medium** for the
load harness and **GPT-6.1 Sol/high** for recovery, plus bounded peer checks of
the retention/runtime guards. The operations and Astra final-gate specialists
were reused to review resource constraints and the added operational tooling.
Their tooling acceptance does not establish production capacity or constitute
nationwide release approval.

The repository and this PR contain the reviewable code changes. Production deployment, legal acceptance, lender source review and live operational gates remain separate recorded decisions.
