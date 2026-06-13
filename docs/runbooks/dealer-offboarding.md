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

Either click through the PB Admin UI (each collection → filter
`dealer = '<id>'` → export), or script it:

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

## Step 4 — Backups

No action needed: Litestream point-in-time backups in R2 have a **14-day
retention**, so the deleted records age out of all backup generations within
14 days of the deletion date. Do not manually edit R2 generations.

Full purge is therefore complete on: **deletion date + 14 days**.

## Step 5 — Log completion

Record (in the dealer-offboarding GH issue, or open one if none exists):

- Dealer name + record id
- Export delivered: date + delivery channel + who confirmed receipt
- Deletion completed: date
- Backup purge complete (deletion date + 14 days): date
- Operator who performed the offboarding

Then delete the local `offboard-<id>/` directory and zip once delivery is
confirmed.
