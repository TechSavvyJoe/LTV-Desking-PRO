# Native full-backup recovery rehearsal

This repeatable drill verifies PocketBase database records **and locally uploaded dealer logos** in a disposable synthetic environment. It complements the database-only Litestream/R2 restore procedure in [r2-backup-setup.md](r2-backup-setup.md). It does not contact Fly, R2, a production API, a production backup, or SMTP.

## Run it

Use Node 24, the existing dependencies, `sqlite3`, `unzip`, and a UNIX PocketBase binary matching `backend/Dockerfile`'s `PB_VERSION`. No dependency installation or production credentials are needed.

```bash
# From the repository root. The default binary must match the Dockerfile pin.
./node_modules/.bin/tsx backend/tools/rehearse-backup.ts

# Or specify an already downloaded, verified local binary of the same version.
./node_modules/.bin/tsx backend/tools/rehearse-backup.ts --binary /absolute/path/to/pocketbase
```

The local `backend/pocketbase` reported 0.23.4 on October 8, 2026; the Dockerfile pin was 0.39.6. The harness rejects that older binary rather than reporting a deployment-version pass. It never downloads or replaces a binary automatically.

Ports **8099 and 8100 must both be free**. The harness creates a new private temporary root, copies current migrations/hooks, uses separate `source/pb_data` and `target/pb_data` directories, and binds only loopback. It accepts no URL, existing database directory, or production restore input. Child processes receive only PATH and their temporary directory, not caller configuration/secrets. Generated passwords are synthetic, random, and not included in the receipt.

## What must pass

1. Seed two synthetic tenants, each with a sales user, an administrator, an inventory record, a sample lender program, dealer settings, a saved deal, an event, and a harmless uploaded SVG logo. Check exact counts before backup.
2. Call PocketBase's native `POST /api/backups`, wait for the completed ZIP, obtain a superuser file token, and download it. Test ZIP integrity and require `data.db` and both logo paths in `storage/`.
3. Start a distinct disposable target and insert a target-only marker. Upload the ZIP with `POST /api/backups/upload`, then request `POST /api/backups/{key}/restore` on **the disposable target only**.
4. Treat HTTP 204 as an asynchronous acknowledgement. Wait for both original tenant identities and the disappearance of the target-only marker after restart. Compare the entire selected record snapshot's SHA-256, including IDs, relations, JSON content, and timestamps, to the source snapshot.
5. Compare each logo's original SHA-256 to both its restored HTTP response and its restored disk bytes. Test each tenant's own lists, cross-tenant record reads/writes, administrator event access, denied tenant backup management, and empty anonymous inventory results.
6. Confirm source record content is unchanged, stop only the harness's process groups (including PocketBase's restart), and require both ports to be free. Require no nonempty database WAL before opening each stopped `data.db` with SQLite read-only/query-only `immutable=1`; require `PRAGMA integrity_check` to return `ok` for source and target.

The stopped/checkpointed requirement matters: `immutable=1` ignores WAL recovery and must never be used as proof for a live or uncheckpointed database. It avoids a macOS `sqlite3 -readonly` opening failure when a WAL-mode database has already removed its WAL/shared-memory sidecars during clean shutdown. A nonempty WAL causes the drill to fail instead of being ignored.

The harness writes `receipt.json` even on ordinary failure, stops its own processes in `finally`, and preserves the source, target, downloaded ZIP, copied migrations/hooks, and logs. SIGINT/SIGTERM stops the owned process groups immediately. It deletes no existing data or retained drill evidence. A failed rehearsal is evidence to investigate, not a recovery approval.

Dealer logo URLs are currently public because `dealers.logo` is an unprotected file field. The HTTP file check verifies the existing behavior; it does not claim private file access.

## Verified local result — October 8, 2026

At repository commit `340ec2f41688f1567724a72dba53fba9aa6060ce`, the drill passed with the cached local **PocketBase 0.39.6** binary. Its SHA-256 was `1d02e3151b9329281234495fd634945d2e053cbe8788da20f55f1cd50e4f2db0`.

| Check                                                               | Observed result                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Records                                                             | 2 dealers, 4 users, 2 inventory, 2 lender programs, 2 saved deals, 2 dealer settings, 2 events |
| Per tenant                                                          | 1 dealer, 2 users, 1 each inventory/lender/deal/settings/event                                 |
| Native ZIP                                                          | 245,411 bytes; database/WAL entries plus both uploaded logos                                   |
| Record snapshot                                                     | Source and restored SHA-256 matched; source content remained unchanged                         |
| Logos                                                               | Both original, restored HTTP, and restored disk SHA-256 values matched                         |
| Cross-tenant access                                                 | Reads and administrator inventory update returned 404 for both tenant directions               |
| Backup management                                                   | Both tenant administrators received 403                                                        |
| Anonymous inventory                                                 | 0 items                                                                                        |
| SQLite                                                              | Source and target `integrity_check` returned `ok`                                              |
| Native backup generation                                            | 397 ms                                                                                         |
| Restore request to restored identities ready                        | 5,095 ms                                                                                       |
| ZIP upload through content/access/integrity validation and shutdown | 13,348 ms                                                                                      |
| Cleanup                                                             | Ports 8099/8100 released; original synthetic source retained                                   |

The retained receipt and ZIP are local temporary artifacts; they are not durable production backups:

```text
/var/folders/w2/t1lz9spd2w1c7qrv4h7h4_yc0000gn/T/ltv-full-backup-rehearsal-7Q0qgB/receipt.json
/var/folders/w2/t1lz9spd2w1c7qrv4h7h4_yc0000gn/T/ltv-full-backup-rehearsal-7Q0qgB/synthetic_full_recovery.zip
```

ZIP SHA-256: `9210be2dae9490c6f47b1e766c95c4e8f5c5b28dcd03cdc070cbb6127de1ccdb`.

An earlier retained attempt (`ltv-full-backup-rehearsal-AbZDfJ`) passed API/content/access checks but failed the final macOS SQLite opening step. The current harness added the stopped/checkpointed `immutable=1` check, then passed a fresh complete rehearsal. Do not substitute the earlier failed receipt for the passing result.

## Production recovery gap and limits

`backend/start.sh` and `backend/litestream.yml` recover/replicate only `data.db`. SQLite replication does not protect `pb_data/storage`, including dealer logos and inventory images. A database-only recovery can retain filenames while losing their bytes.

The native full ZIP mechanism validated here provides a recovery path for **local uploaded files**, but this drill does not configure production scheduling, retention, off-host delivery, remote durability, or freshness monitoring. Before claiming protection from volume loss, configure a full-data backup policy covering those files in a separate backup destination, measure successful recent backups, and retrieve/restore an off-host backup in an isolated environment using the deployment runtime. Keep the original volume/source until the replacement's database, files, counts, and access controls have passed acceptance. Do not run this target-replacing API against a real environment merely to test it.

The measured times cover a small local synthetic fixture. They do not establish a production RPO/RTO, R2 recovery, large-volume recovery, backup cadence, or email delivery. Native ZIP backups exclude files stored in S3; those need their own object-storage backup/recovery validation. The ZIP does not package the executable or repository hooks/migrations; retain the versioned application separately. PocketBase's native restore replaces target data and restarts the process, and is documented as experimental on UNIX; this drill exercised that behavior safely because its target was disposable.

## Official references

- [PocketBase backup and restore](https://pocketbase.io/docs/going-to-production/#backup-and-restore): full `pb_data` ZIP scope and local-file/S3 limits.
- [PocketBase backup API](https://pocketbase.io/docs/api-backups/): create, upload, restore, and token-authorized download endpoints.
- [PocketBase 0.39.6 backup implementation](https://github.com/pocketbase/pocketbase/blob/v0.39.6/core/base_backup.go): transaction, excluded directories, target replacement, and restart behavior for the tested pin.
- [PocketBase 0.39.6 restore endpoint](https://github.com/pocketbase/pocketbase/blob/v0.39.6/apis/backup.go): asynchronous restore acknowledgement.
- [SQLite immutable URI parameter](https://www.sqlite.org/uri.html#uriimmutable): read-only assumptions and immutable-file requirements.
