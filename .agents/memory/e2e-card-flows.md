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

## Gotchas
- Onboarding sometimes glitches and resets to step 1 after the final click even though `POST /api/profiles` returns 201. Don't treat as failure; the profile exists — navigate to the next page by URL.
- Reaching the parcours summary without a mic: use the "Sauter l'oral et voir mon débrief" button (`button-parcours-skip-oral`).
- validées/towork counts use a ~0.9s CountUp animation — wait ~1.5s before reading the number or you'll read a mid-animation value.
