---
name: E2E testing auth-gated card/parcours flows
description: How to drive the rating + celebration + parcours flows in Playwright E2E tests, including controlling the due-card queue size.
---

# E2E testing the card rating / celebration / parcours flows

These screens are behind Replit OIDC + an onboarding-created profile, so a test must: log in via `testReplitAuth: true` (set OIDC claims, click login), complete the 6-step onboarding, then drive `/cards` or `/parcours`.

## Controlling the due-card queue size (key trick)
The due endpoint cold-start returns every `mother_cards` row that has NO `srs_states` row (capped at 10; parcours écrit caps at 5). To get a small, deterministic queue, insert future-due srs_states for ALL cards except the N you want:

```
INSERT INTO srs_states (profile_id, card_id, due_date)
SELECT <profileId>, card_id, '2099-01-01'
FROM mother_cards
WHERE language='fr' AND card_id NOT IN (<N card_ids to keep new>);
```
**Why:** the dev DB has ~1440 cards, so a fresh profile otherwise gets a 5–10 card queue — too many AI `generate-answer` calls for the test step budget.
**How to apply:** This INSERT touches ~1440 rows on purpose. Test subagents tend to "correct" it down to N rows (which inverts the logic and leaves the full queue) — explicitly tell the agent the large row count is expected and must not be altered.

## Settings (/parametres) + delete-account flows
- `/parametres` redirects to `/onboarding` when the logged-in user has NO `user_profiles` row. Skip onboarding by seeding directly after login: `INSERT INTO user_profiles (user_id) VALUES ('<sub>');` — every other column has a safe default.
- Delete account: `button-delete-account` opens AlertDialog `dialog-delete-account`, confirm with `button-confirm-delete`; client then redirects to `/api/logout`. Assert teardown via DB (`user_profiles`/`users` count = 0 for the sub) AND that `GET /api/auth/user` now returns 401 (server destroys the session, not just the client redirect).
- **Schema-drift gotcha:** login (`/api/login`) crashed with 502 `column "custom_image_url" of relation "users" does not exist` because the dev DB was behind `shared/models/auth.ts`. Fix is `npm run db:push --force` then restart — not a code bug. Run db:push first if auth/upsert 502s in e2e.

## testReplitAuth block is sticky within a session
`runTest` for these OIDC-gated flows MUST pass `testReplitAuth: true` on the FIRST call. If the first run omits it, the agent hits the real Replit OIDC consent page, records a hard "external OAuth" block, and that block STICKS for the rest of the session — every subsequent `runTest` (even with the flag added) returns the same "Testing was blocked earlier" error. There is no in-session recovery; don't keep retrying. Verify the flag is set before the very first run.

## Premium gating in e2e
Grant premium to a test user via DB (admin override, no Stripe): `UPDATE users SET subscription_status='active', subscription_expires_at=NULL WHERE id='<sub>';`. Free = default. After granting, do a full page reload so the `/api/subscription/status` query (staleTime 60s) refetches.

## Gotchas
- Onboarding sometimes glitches and resets to step 1 after the final click even though `POST /api/profiles` returns 201. Don't treat as failure; the profile exists — navigate to the next page by URL.
- Reaching the parcours summary without a mic: use the "Sauter l'oral et voir mon débrief" button (`button-parcours-skip-oral`).
- validées/towork counts use a ~0.9s CountUp animation — wait ~1.5s before reading the number or you'll read a mid-animation value.
