#!/bin/bash
# One-shot wiring script for Sentry DSN + R2 backup credentials.
#
# Prerequisites you do first in browsers:
#   1. Cloudflare:  R2 enabled + bucket "ltv-desking-pro-backups" exists +
#                   an API token with Object Read & Write scoped to that bucket
#   2. Sentry:      a project exists, DSN copied
#
# Usage:
#   chmod +x docs/runbooks/wire-sentry-and-r2.sh
#   ./docs/runbooks/wire-sentry-and-r2.sh
#
# The script prompts for each value (input hidden), stores them as GitHub
# Actions repo secrets via the gh CLI, then triggers the set-fly-secrets
# workflow + a Vercel redeploy to pick up the new env.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Setting secrets on: $repo"
echo

# Each `read -s` reads silently. Trim accidental whitespace.
read -rsp "Cloudflare account ID (for R2 endpoint URL): " CF_ACCOUNT_ID; echo
read -rsp "R2 Access Key ID:                              " R2_KEY_ID; echo
read -rsp "R2 Secret Access Key:                          " R2_SECRET; echo
read -rsp "Sentry DSN (https://...@sentry.io/...):        " SENTRY_DSN; echo
echo

# Sanity-check the account ID: must be exactly 32 hex chars. A doubled
# paste (~64 chars) would silently break LITESTREAM_ENDPOINT downstream.
if ! printf '%s' "$CF_ACCOUNT_ID" | grep -Eq '^[0-9a-f]{32}$'; then
  echo "ERROR: Cloudflare account ID must be exactly 32 hex characters." >&2
  echo "       Got: ${#CF_ACCOUNT_ID} chars. Aborting." >&2
  exit 1
fi

# Derive the S3-compatible endpoint from the account ID
R2_ENDPOINT="https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo
echo "Derived R2 endpoint: $R2_ENDPOINT"
echo "(verify this looks right before continuing)"
echo

echo "Pushing 5 GitHub Actions secrets…"
printf '%s' "ltv-desking-pro-backups" | gh secret set LITESTREAM_BUCKET --app actions
printf '%s' "$R2_ENDPOINT"            | gh secret set LITESTREAM_ENDPOINT --app actions
printf '%s' "$R2_KEY_ID"              | gh secret set LITESTREAM_ACCESS_KEY_ID --app actions
printf '%s' "$R2_SECRET"              | gh secret set LITESTREAM_SECRET_ACCESS_KEY --app actions
printf '%s' "$SENTRY_DSN"             | gh secret set VITE_SENTRY_DSN --app actions

echo "✔ Secrets stored."
echo
echo "Triggering set-fly-secrets workflow…"
gh workflow run set-fly-secrets.yml
echo "  Watch progress: gh run watch  (or)  gh run list --workflow=set-fly-secrets.yml"
echo

echo "Triggering Vercel redeploy so VITE_SENTRY_DSN takes effect…"
gh workflow run "Deploy Frontend to Vercel"
echo "  Watch progress: gh run list --workflow=deploy-vercel.yml --limit 1"
echo

echo "All done. Sentry should start receiving events on the next deploy."
echo "Litestream banner should appear in 'fly logs -a ltv-desking-pro-api' within ~60s."
