---
name: Parcours SRS rule
description: How SM-2 rating events must be emitted when a card is practiced both in writing and orally in one flow.
---

# Parcours SRS double-advance avoidance

When a single card is practiced both in writing (CardStep) and orally (VocalStep) in the same `/parcours` run:

- The **written self-rating is the only canonical SM-2 event** — CardStep posts `/api/flashcards/rate` inline as soon as the user rates.
- The **oral phase must NOT advance** the SM-2 schedule. It may only **downgrade**: post `rate('hard')` only when the live conversation's `globalDynamic.rating === 'hard'` AND that same card's written rating was `medium`/`easy`.

**Why:** if both phases rated, a card would get two SM-2 events in one session and its interval would double-advance (or thrash). The downgrade-only exception lets a bad oral performance correct an over-optimistic written rating without inflating the schedule.

**How to apply:** any future flow that practices the same card in multiple modalities within one session must pick ONE canonical rating event and treat the others as at-most-downgrade. Standalone "mode libre" Cartes and Vocal each rate once on their own, so they are each canonical (no conflict).
