---
name: AI usage quota enforcement
description: How free-tier AI metering is enforced (where, atomicity, fail mode) and which endpoints must be metered vs only authed.
---

# AI usage quota enforcement

Free tier limits are enforced by a `quotaGuard(type)` middleware that runs AFTER `isAuthenticated`. Types: `flashcard` (daily) and `vocal_session` (weekly). Premium/trial users pass unlimited.

## Where each AI flow is metered
- **flashcard** quota: metered on `/api/flashcards/generate-answer` (the card model-answer generation).
- **vocal_session** quota: metered ONLY on `/api/session/opening` — the canonical "start a vocal simulation" entry point that the client always calls and that seeds the server-side persona cache.
- `/api/session/dialogue-turn` is the **vocal continuation** (only `vocal-step.tsx` calls it; the text card flow does not). It must NOT carry a per-turn `quotaGuard` — metering each turn would break the "1 vocal session = 1 whole conversation" model and double-count, especially since it regenerates the persona on a cache miss (server restart mid-session).
- Instead it is bound to the metered start by a **signed session token**: `/opening` mints one (`signVocalSession`, HMAC over `userId`+`cardId`, 1h TTL) and `dialogue-turn` requires it (`verifyVocalSession`). This stops an authenticated free user from calling the continuation directly to bypass the weekly quota, while staying stateless so a mid-session restart doesn't re-charge. The client (`vocal-step.tsx`) stores the token from `/opening` and sends it with every turn.

**Why:** the quota unit is one conversation, charged once at its start; auth alone doesn't stop a logged-in free user from hitting the continuation endpoint directly.

## Atomicity + fail mode (non-obvious decisions)
- The guard **reserves a slot up front** (atomic check-then-insert) and **rolls it back** on a non-2xx `finish` or a client-abort `close` where `!res.writableEnded`, so a failed/aborted AI call never burns quota.
- Atomicity uses `pg_advisory_xact_lock(hashtext('quota:'+userId+':'+type))` inside a `db.transaction` (node-postgres Pool supports it), then count + conditional insert. **Why:** plain count-then-insert lets parallel requests each read a stale count and over-consume; verified the lock holds concurrent fan-out to exactly the limit.
- The guard **fails closed (503)** if the access tier or the count query throws. **Why:** the old fail-open let free users bypass limits during any quota-system error.

## Checkout price safety
`/api/stripe/checkout` validates the posted `priceId` against the synced premium-plan allowlist before creating a session, so a caller can't check out an arbitrary price id. The allowlist (shared with `/api/stripe/plans`) is `stripe.prices ⋈ stripe.products WHERE metadata->>'bagou_plan'='premium' AND both active AND currency='eur' AND recurring->>'interval' IN ('month','year')`. Plans/prices live only in the synced `stripe.*` schema, never a custom table.
