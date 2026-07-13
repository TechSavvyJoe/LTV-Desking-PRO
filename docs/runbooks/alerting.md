# Runbook — Alerting & observability (M3)

## Current state

**Nothing pages today.** Fly logs and GitHub workflow artifacts are the primary
signals. There is no PagerDuty / Opsgenie / Better Stack on-call integration yet.
Treat the recommendations below as the minimum bar before multi-dealer GA.

## External uptime check

Point an external monitor (Better Stack, UptimeRobot, Checkly, or Fly's own
checks) at:

```text
GET https://ltv-desking-pro-api.fly.dev/api/health
```

Expect HTTP 200 within a few seconds. Alert on:

- Consecutive failures (≥2 in 5 minutes)
- Sustained latency > 5s

Also monitor the Vercel frontend origin and `GET /api/ai/models` (expect 200;
429 from the anonymous IP limiter under scrape load is not an outage).

## Log lines worth alerting on

| Source                 | Pattern / signal                                                                  | Severity                                                   |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `backend/start.sh`     | `FATAL:` (Litestream missing, restore failed, required backup settings missing)   | Page — machine will not serve healthy traffic              |
| Litestream             | validation / `ERROR` during restore or replication; missing snapshot after deploy | Page or high — backup chain at risk                        |
| PocketBase `log.pb.js` | structured JSON with `"error": true` or HTTP 5xx on `/api/`                       | Warn → page if sustained                                   |
| Fly platform           | OOM kill, `max restart count of 10`, host evacuation                              | Page — see [`pb-down.md`](pb-down.md) / [`oom.md`](oom.md) |
| Vercel AI proxy        | repeated `AI quota service is unavailable` / auth-refresh failures                | Warn — often PB down                                       |

Ship Fly logs to a log drain (Better Stack Logtail, Axiom, Datadog, or Fly
Log Shipper → your SIEM) and create alert rules on those patterns. Until a
drain exists, use `gh workflow run fly-diag.yml` and `fly logs` during incidents.

## Deploy outage window (single machine)

Production PocketBase runs as **one Fly machine** with a single attached volume.
A normal `fly deploy` (or secret change that restarts the machine) produces an
**API outage of roughly 30–90 seconds** while the new image boots, Litestream
attaches, and PocketBase becomes healthy. Plan owner-facing changes and
quarterly rotations accordingly; there is no hot standby today.

## Recommended next steps

1. External uptime check on `/api/health` with SMS/email (minimum).
2. Fly log shipper → Better Stack (or equivalent) with FATAL / Litestream rules.
3. Optional: Sentry metric alerts for Vercel AI proxy 5xx rate.
4. Before multi-region HA: document RPO/RTO in [`db-restore.md`](db-restore.md)
   and decide whether a second machine + volume is worth the Litestream
   complexity.
