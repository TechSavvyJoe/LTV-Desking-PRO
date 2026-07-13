# Runbook — Restore SQLite DB from R2

## Safety rules

- Never restore over the mounted production database.
- Never destroy the only production machine or volume during diagnosis or
  recovery.
- Validate the R2 generation in an isolated, read-only drill before cutover.
- Keep the old machine stopped, not destroyed, until the replacement is healthy
  and a new backup has been observed.

## Symptoms

- The Fly volume is unavailable, corrupted, or unexpectedly empty.
- PocketBase starts without expected collections or records.
- Fly reports a host outage for the machine with the only attached volume.

## Triage

Record the current machine and volume IDs before changing state:

```bash
APP=ltv-desking-pro-api
fly machine list --app "$APP" --json | jq .
fly volumes list --app "$APP" --json | jq .
gh workflow run fly-diag.yml
```

Run the read-only procedure under "Quarterly restore drill" in
[`r2-backup-setup.md`](r2-backup-setup.md). Stop if the isolated restore or
`PRAGMA integrity_check` fails; do not expose an unverified database to
production traffic.

## Recovery to a replacement volume

The replacement starts from a new empty volume. `start.sh` restores R2 before
PocketBase starts, while the original volume remains attached to the stopped
original machine.

```bash
set -euo pipefail
APP=ltv-desking-pro-api
REGION=ord

MACHINES=$(fly machine list --app "$APP" --json)
OLD_MACHINE_ID=$(printf '%s' "$MACHINES" | jq -r '
  [.[] | select((.state // .State) == "started") | (.id // .ID)]
  | if length == 1 then .[0] else empty end
')
if [ -z "$OLD_MACHINE_ID" ]; then
  echo "Expected exactly one started production machine; stop and investigate."
  exit 1
fi

VOLUMES=$(fly volumes list --app "$APP" --json)
OLD_VOLUME_ID=$(printf '%s' "$VOLUMES" | jq -r --arg machine "$OLD_MACHINE_ID" '
  [.[]
    | select((.attached_machine_id // .attachedMachineId // .AttachedMachineId) == $machine)
    | (.id // .ID)]
  | if length == 1 then .[0] else empty end
')
if [ -z "$OLD_VOLUME_ID" ]; then
  echo "Expected exactly one volume on the active machine; stop and investigate."
  exit 1
fi

# Preserve one more point-in-time copy when the old host is reachable.
fly volumes snapshots create "$OLD_VOLUME_ID" --app "$APP" || true

NEW_VOLUME=$(fly volumes create ltv_desking_data \
  --app "$APP" \
  --region "$REGION" \
  --size 1 \
  --snapshot-retention 14 \
  --json)
NEW_VOLUME_ID=$(printf '%s' "$NEW_VOLUME" | jq -r '.id // .ID // empty')
if [ -z "$NEW_VOLUME_ID" ] || [ "$NEW_VOLUME_ID" = "$OLD_VOLUME_ID" ]; then
  echo "A distinct replacement volume was not created."
  exit 1
fi

# Stop writes, but retain the original machine and its attached volume.
fly machine stop "$OLD_MACHINE_ID" --app "$APP"

# Clone the known machine configuration and explicitly attach the replacement.
# The clone starts with the existing app secrets; start.sh restores R2 first.
fly machine clone "$OLD_MACHINE_ID" \
  --app "$APP" \
  --region "$REGION" \
  --attach-volume "$NEW_VOLUME_ID:/pb/pb_data" \
  --name "restore-$(date -u +%Y%m%d%H%M%S)"

fly machine list --app "$APP"
fly volumes list --app "$APP"
fly logs --app "$APP" --no-tail | tail -100
curl --retry 12 --retry-delay 5 --retry-all-errors \
  --connect-timeout 10 --max-time 30 -fsS \
  "https://$APP.fly.dev/api/health" | jq -e '.code == 200'
```

Expected RTO is 5–15 minutes for a small database. Confirm an owner can sign in
and spot-check known dealer and deal counts. Then confirm Litestream logs a new
snapshot from the replacement.

## Roll back the cutover

If the replacement fails validation and the original database is known usable,
stop the replacement machine and restart `OLD_MACHINE_ID`. Never run both
SQLite-backed machines at once. If the original database is corrupt, leave both
machines stopped and escalate rather than serving uncertain data.

## Cleanup hold

Keep the stopped original machine and volume for at least 48 hours and until all
of these are true:

- production health and owner checks pass;
- a new R2 snapshot from the replacement is visible;
- a new Fly volume snapshot exists; and
- cleanup has explicit operator approval.

Pause normal Fly releases during this hold. The original and replacement are
both launch-managed machines, so a normal deploy may update or start both and
create two SQLite writers. An emergency image change during the hold requires a
reviewed machine-specific procedure.

Only then schedule separate cleanup. At no point should cleanup leave the app
with a single unverified recovery path.

## How Litestream selects data

Litestream stores generations under
`s3://ltv-desking-pro-backups/data.db/generations/<generation-id>/`. With no
timestamp override, restore selects the most recent recoverable data. The
isolated drill is the evidence that this selection is readable before cutover.
