# Read-only retention review

The report counts saved deals by **last update** and immutable deal events by
**creation time**, using an operator-selected exclusive UTC cutoff. It never
deletes or anonymizes records, and an old record is not automatically eligible
for disposal. Review legal holds, continued business use, the approved retention
schedule and dealer obligations before a separate disposal action.

Use an existing, short-lived PocketBase `_superusers` token through
`PB_RETENTION_TOKEN`. Tenant admins cannot provide the privileged schema receipt
this tool requires. No new credentials or privileges are created by the tool.

```bash
# Supply PB_RETENTION_TOKEN privately in the environment, not in command arguments.
# The date below is only a syntax example, not a recommended retention cutoff.
./node_modules/.bin/tsx backend/tools/retention-report.ts \
  --url https://ltv-desking-pro-api.fly.dev \
  --dealer <15-character-dealer-record-id> \
  --before 2026-01-01T00:00:00.000Z \
  --output /approved/private/location/new-retention-report
```

All remote requests are GETs. The tool requests only record identifiers,
dealer relations and timestamps, then writes aggregate counts and date bounds.
It never writes customer names, notes, event snapshots, audit details, record
IDs or the authentication token. The selected dealer ID is report metadata.
Existing output directories are refused. New directories use mode `0700`,
`report.json` uses `0600`, and the SHA-256 `receipt.json` uses `0400`.

Compare the report bytes with the receipt hash before sharing or reviewing it.
Missing, malformed and contradictory timestamps are counted separately as
`reviewNeeded` and excluded from the age groups. In particular, legacy event
rows may have no creation timestamp; no date is invented for them. A timestamp
equal to the cutoff is counted with the newer group.

## Platform audit scope

`audit_log` has no authoritative dealer relation. A current user's dealer
assignment cannot reliably attribute past platform activity. The default report
therefore omits it and records that limitation. The platform owner may pass
`--include-platform-audit` to add **global** audit age counts; those counts are
explicitly labelled platform-scoped and must not be presented as one dealer's
history or complete offboarding coverage.

## Consistency and operational limits

The tool rejects changed totals, missing or duplicate pages/IDs, wrong-dealer
rows and a changed dealer checkpoint. These checks do not make REST pagination
a transaction: same-count edits can remain undetected. Freeze tenant and owner
writes, or reconcile with a verified full database backup, before using a report
in any disposal decision. This tool is a review aid, not a deletion manifest or
a compliance acceptance receipt.

The existing [retention policy](../DATA_RETENTION_POLICY.md) needs an approved
schedule and a reviewed disposal procedure covering deals **and** evidentiary
logs. This report fills the visibility gap; it does not establish a lawful
period, execute holds, purge backups or deliver customer deletion requests.

Validation: focused fixture tests cover paging beyond 500 records, authorization
denial, UTC calendar boundaries, unknown dates, tenant scope, duplicate IDs,
payload exclusion, hash receipts, permissions and existing-output preservation.
