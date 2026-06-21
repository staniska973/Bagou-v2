---
name: Account self-deletion flow
description: What a correct DELETE /api/account must do — local cleanup tables, Stripe cancellation ordering, and server-side session invalidation.
---

# Account self-deletion

`DELETE /api/account` (auth-gated, claims.sub only) must do three things in order:

1. **Cancel external billing FIRST.** If the user has a `stripeCustomerId`, list
   their Stripe subscriptions and cancel any still-billable status
   (active/trialing/past_due/unpaid/paused) via `stripe.subscriptions.cancel(id)`
   **before** deleting local rows. If Stripe throws, return 502 and do NOT delete
   anything — otherwise the user is wiped locally but keeps getting billed with no
   portal to cancel from.
2. **Delete local data in a transaction.** Must explicitly remove `userProfiles`
   (cascades to srs_states / training_sessions / session_events), `usageEvents`,
   `vocalSessions`, and the `users` row. **Why:** `userProfiles.userId` and
   `usageEvents.userId` / `vocalSessions.userId` are plain varchars, **not** FKs to
   `users`, so deleting the users row alone leaves orphaned rows.
3. **Invalidate the session server-side**: `req.logout(cb)` → `req.session.destroy(cb)`
   → `res.clearCookie("connect.sid")`. **Why:** `isAuthenticated` only checks
   `req.user` + `expires_at`, not whether the users row still exists, so a deleted
   account could keep making authenticated requests if you rely solely on the
   client's `/api/logout` redirect. (Session cookie uses the default `connect.sid`.)

**How to apply:** any "delete my account / data" feature on this app needs all
three steps.

**Testing the Stripe-cancel path without a real subscription:** `stripeClient.ts`
exposes a test-only injection hook (`__setStripeClientFactoryForTests`) so specs
can substitute a fake Stripe client — the dynamic `import("./stripeClient")` in
the route and the test resolve to the same module instance, so setting the hook
in the test takes effect in the route. (Reassigning a dynamic-import namespace
property does NOT work under tsx/esbuild — assignment silently no-ops and the
route still sees the real export; that's why a function-call hook is needed.)
The local-delete transaction and `authStorage.getUser` are stubbed by mutating
the imported `db`/`authStorage` objects (same trick as the profile-image spec).
A passport stub must also provide `req.logout` + `req.session.destroy` or the
success path throws. Spec: `server/account-deletion.test.ts` (in the `test`
validation workflow).

**Session-invalidation (step 3) is asserted, not just stubbed:** the spec has a
session-backed auth path (an in-memory store keyed by an `x-test-session` header)
where `req.session.destroy` actually deletes the session entry. The case proves
the route calls `req.logout` AND `req.session.destroy`, clears the `connect.sid`
cookie (empty + expired, read via undici `getSetCookie()`), and that reusing the
same session afterward is rejected 401 — i.e. a deleted account is locked out.
