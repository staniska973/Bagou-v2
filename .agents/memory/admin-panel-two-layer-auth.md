---
name: Admin panel auth (single gate)
description: /admin is reachable directly and guarded ONLY by its own admin session — how to reach it in Playwright tests.
---

# Admin panel auth: single independent gate

`/admin` is rendered at the top level of `AppContent` (`client/src/App.tsx`) BEFORE
the app-wide Replit-account gate, so it loads for logged-out visitors too. It is
guarded ONLY by its own username/password admin session
(`client/src/pages/admin.tsx` → `GET /api/admin/check`, login `POST /api/admin/login`;
server middleware `isAdminSession` checks `req.session.adminLoggedIn` only — it does
NOT depend on Replit OAuth).

**Why:** The admin panel has its own credentials, so requiring a Replit-account
login first was a redundant, confusing extra gate. An admin (e.g. inviting people
to use the app for free) needs a clean `/admin` login page reachable without an app
account. (Earlier this was a two-layer gate behind Replit OAuth — that is no longer
true; do not plan tests around it.)

**How to apply (testing skill):**
- You do NOT need `testReplitAuth` to reach the admin login form anymore: navigate
  straight to `/admin`, fill `input-admin-username` / `input-admin-password`, click
  `button-admin-login`, and the dashboard renders.
- Admin creds live in env `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Check existence via
  `viewEnvVars` in the code sandbox; `process.env` is NOT exposed inside the
  code_execution sandbox (use bash + `jq -nc --arg ...` to build the login body
  without echoing values).
- Session cookie is `secure: true`: it is set correctly over the HTTPS preview proxy
  but plain HTTP/localhost curl will not resend it (so a curl `GET /api/admin/check`
  after a curl login shows `{"ok":false}` even though login returned 200 — not a bug).

# Admin can grant free Premium ("Premium offert")
The admin dashboard already grants free paid access without Stripe: Clients tab →
search a user → detail panel → "Accès complémentaire (offert)" → "Offrir Premium"
(optional expiry, blank = permanent) / trial-days grant / revoke. Backed by
`POST /api/admin/users/:id/grant-premium|revoke-premium` which set the user's
`subscriptionStatus` override read by `getEffectiveAccess` (source "admin",
`unlimited: true`). Independent of Stripe.
