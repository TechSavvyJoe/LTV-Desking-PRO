# Runbook — Dealer offboarding (export + delete)

Manual procedure for offboarding a single dealer: export their data, deliver
the archive, then delete every record belonging to them. Written for the
platform owner (superadmin). Expect ~30 minutes end-to-end for a typical
dealer.

## When to use

- A dealer cancels / their contract ends
- A dealer requests their data and deletion (data-subject request)
- See also [`docs/DATA_RETENTION_POLICY.md`](../DATA_RETENTION_POLICY.md)

## Prerequisites

- Superadmin credentials for PB at `https://ltv-desking-pro-api.fly.dev`
- The dealer's record id (find it in the Owner Console → Dealers tab, or PB
  Admin UI at `https://ltv-desking-pro-api.fly.dev/_/` → `dealers` collection)
- `curl` and `jq` locally

All per-dealer data lives in collections linked by a `dealer` relation field:
`inventory`, `lender_profiles`, `saved_deals`, `deal_events`, `dealer_settings`,
`users` — plus the `dealers` record itself.

## Step 1 — Export the dealer's data

Deactivate the dealership in Owner Console before collecting the final
archive. This prevents ordinary tenant writes; also pause owner writes for
this dealership until export and deletion finish. Retain the original active
state if the request is only an export and the dealership will resume service.

Use the paginated read-only export tool from the repository root:

```bash
# Obtain a short-lived PB _superusers bearer token through your authorized
# administrator session and load it into PB_EXPORT_TOKEN without shell history.
: "${PB_EXPORT_TOKEN:?load the authorized PB superuser token}"
npx tsx backend/tools/export-dealer.ts \
  --url https://ltv-desking-pro-api.fly.dev \
  --dealer '<dealer-record-id>' \
  --output '<new-private-directory>'
unset PB_EXPORT_TOKEN
```

The tool requires explicit origin/dealer/output and superuser schema-read
access (app-admin reads may redact private fields). It fetches all pages of
every collection below, checks dealer scope and counts, and writes JSON arrays
plus `receipt.json` with SHA-256 hashes. The directory is mode 0700, data files
0600, receipt 0400; existing output directories are never overwritten. Failure
removes its partial directory. It never changes or deletes remote records and
prints no customer data. Verify hashes and counts before delivery. The receipt
does not contain credentials. Keep it with the private export; do not commit it.
File fields contain filenames, not uploaded bytes; include a separately
verified download of dealer logos/local files if the requested archive covers
those assets. The JSON receipt verifies only the JSON files it lists.

A live export requires the explicit `--allow-active` option. It is not suitable
as the final offboarding archive: REST pagination is not an atomic database
snapshot, and even stable counts cannot detect concurrent record edits.

Alternatively click through the PB Admin UI (each collection → filter
`dealer = '<id>'` → export), or use the legacy manual procedure below:

```bash
# Authenticate as superadmin
TOKEN=$(curl -sS -X POST https://ltv-desking-pro-api.fly.dev/api/collections/_superusers/auth-with-password \
  -H "Content-Type: application/json" \
  -d '{"identity":"<superadmin-email>","password":"<password>"}' | jq -r .token)

DEALER_ID="<dealer-record-id>"
mkdir -p "offboard-$DEALER_ID"

# The dealers record itself
curl -sS "https://ltv-desking-pro-api.fly.dev/api/collections/dealers/records/$DEALER_ID" \
  -H "Authorization: Bearer $TOKEN" > "offboard-$DEALER_ID/dealer.json"

# Every dealer-scoped collection, as JSON
for col in inventory lender_profiles saved_deals deal_events dealer_settings users; do
  curl -sS -G "https://ltv-desking-pro-api.fly.dev/api/collections/$col/records" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "filter=dealer='$DEALER_ID'" \
    --data-urlencode "perPage=500" \
    > "offboard-$DEALER_ID/$col.json"
done
```

Check `totalItems` in each file — if any collection has more than 500 records,
repeat with `--data-urlencode "page=2"` (then 3, …) and merge.

Optional CSV conversion (per collection):

```bash
jq -r '(.items[0] | keys_unsorted) as $k | $k, (.items[] | [.[$k[]]] ) | @csv' \
  "offboard-$DEALER_ID/inventory.json" > "offboard-$DEALER_ID/inventory.csv"
```

Sanity-check the export before deleting anything: open each file and confirm
record counts roughly match what the Owner Console shows for that dealer.

## Step 2 — Deliver the archive to the dealer

```bash
zip -re "offboard-$DEALER_ID.zip" "offboard-$DEALER_ID"   # -e = password-protect
```

Deliver via a secure channel (password-protected zip; share the password
out-of-band, not in the same email). Do NOT leave the archive in shared
drives after delivery is confirmed.

## Step 3 — Delete, in dependency order

Delete child records before their parents. Order:
**saved_deals → deal_events → inventory → lender_profiles → dealer_settings →
users → dealers record**.

```bash
for col in saved_deals deal_events inventory lender_profiles dealer_settings users; do
  echo "== $col =="
  ids=$(curl -sS -G "https://ltv-desking-pro-api.fly.dev/api/collections/$col/records" \
    -H "Authorization: Bearer $TOKEN" \
    --data-urlencode "filter=dealer='$DEALER_ID'" \
    --data-urlencode "perPage=500" | jq -r '.items[].id')
  for id in $ids; do
    curl -sS -X DELETE "https://ltv-desking-pro-api.fly.dev/api/collections/$col/records/$id" \
      -H "Authorization: Bearer $TOKEN" -o /dev/null -w "$col/$id -> %{http_code}\n"
  done
done

# Finally, the dealers record itself
curl -sS -X DELETE "https://ltv-desking-pro-api.fly.dev/api/collections/dealers/records/$DEALER_ID" \
  -H "Authorization: Bearer $TOKEN" -o /dev/null -w "dealers/$DEALER_ID -> %{http_code}\n"
```

Every line should print `-> 204`. Re-run the per-collection loop until each
collection returns no ids (covers >500-record collections). A `400` on the
`dealers` delete usually means a child record still references it — re-check
each collection with the filter from Step 1.

Verify: re-run the Step 1 export loop; every file should show
`"totalItems": 0`, and the `dealers` fetch should return 404.

Also remove `ai_rate_limits` counters whose `subjectType = 'dealer'` and
`subjectId` equals the dealer ID, and whose `subjectType = 'user'` and
`subjectId` is one of the exported user IDs. These locked internal counters
have no dealer relation and are excluded from the dealer-data export. Use
the PB superuser dashboard; verify the filtered counts reach zero. Audit logs
have a separate retention policy; review any dealer/user identifiers there
under `DATA_RETENTION_POLICY.md` rather than treating tenant deletion as an
audit-log purge.

## Step 4 — Backups

Litestream snapshot/LTX retention and Fly volume snapshot retention are
configured for **14 days**. This is configuration, not evidence that old
objects have been removed. Do not manually edit R2 backup chains. Verify
retention is operating in both R2 and Fly, and account for isolated restore
copies and privately delivered export archives.

Record **deletion date + 14 days** as the expected backup expiry date. Confirm
the evidence before marking backup purge complete; failed replication,
retention jobs, or retained recovery volumes require investigation.

## Step 5 — Log completion

Record (in the dealer-offboarding GH issue, or open one if none exists):

- Dealer name + record id
- Export delivered: date + delivery channel + who confirmed receipt
- Deletion completed: date
- Backup purge complete (deletion date + 14 days): date
- Operator who performed the offboarding

Then delete the local `offboard-<id>/` directory and zip once delivery is
confirmed.
