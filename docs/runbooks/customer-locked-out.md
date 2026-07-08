# Runbook — Customer locked out

## Symptom

- Dealer user reports they can't log in
- Their `dealer` field is NULL or pointing at a deleted dealer
- Their account is `verified: false` and stuck in a verification-email loop

## Triage (60 seconds)

```bash
# Identify the user via the Owner Console (Users tab → search by email)
# OR via PB Admin UI at https://ltv-desking-pro-api.fly.dev/_/

# Quick SQL check (read-only — safe):
fly ssh console -a ltv-desking-pro-api -C \
  "sqlite3 /pb/pb_data/data.db \
   \"select id, email, role, dealer, verified from users where email='user@example.com';\""
```

Decision tree:

- **`dealer` is NULL** → see Recovery → A
- **`dealer` points to wrong/deleted ID** → see Recovery → B
- **`verified` is 0** → see Recovery → C
- **Authentication itself fails (wrong password)** → see Recovery → D

## Recovery

### A. dealer field is NULL — repair via Owner Console

1. Log in as superadmin → Owner Console → Users tab
2. Click edit on the user
3. Set their dealer to the correct one
4. Save. They can log in immediately.

### B. dealer points to wrong dealer

Same as A — superadmin edits to repair. The `dealer_guard.pb.js` hook will NOT block a superadmin write (superadmin is exempt).

### C. Email not verified

PB has a built-in flow:

1. PB Admin UI → users collection → find the user
2. Set `verified: true` manually
3. OR trigger a new verification email: `POST /api/collections/users/request-verification` with `{email}`

### D. Wrong password

PB Admin UI → users collection → edit user → change password (admin-write bypasses self-verification).

Or via API as superuser:

```bash
curl -X POST https://ltv-desking-pro-api.fly.dev/api/collections/users/records/<user-id> \
  -H "Authorization: <superuser-token>" \
  -H "Content-Type: application/json" \
  -d '{"password":"<new>","passwordConfirm":"<new>"}'
```

User should change it on first login.

## Root cause

- If `dealer` is NULL: the user signed up before the `dealer` field existed (unlikely now), or via a flow that didn't set it. Audit `lib/auth.ts:register` to confirm `dealer:` is always set on signup.
- If multiple users hit this: check whether a dealer record was deleted without first reassigning users.

## Prevention

- `dealer_guard.pb.js` hook (already shipped) prevents writing wrong dealer on subsequent updates
- Dealer-delete: follow order in `dealer-offboarding.md` (delete users/children first); direct PB admin delete of dealer will fail if children reference it (enforced at app layer in offboarding flow, not a DB FK yet)
- Onboarding flow validation — require dealer code at signup
