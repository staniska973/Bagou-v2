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
three steps; testing the no-Stripe path is easy, the Stripe-cancel path needs a
real subscription so verify it by reasoning + SDK method existence.
