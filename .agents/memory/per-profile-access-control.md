---
name: Per-profile endpoint access control
description: Auth/ownership is NOT applied uniformly across API routes; new per-profile endpoints must add it explicitly.
---

# Per-profile endpoint access control

Many existing routes that take a `:profileId` (e.g. some `/api/stats/*` paths) are
left **unauthenticated and without ownership checks** — do not assume the app
protects per-profile data globally.

**Rule:** any new endpoint returning a specific user's data (aggregates, AI
analysis, etc.) must (1) use the `isAuthenticated` middleware and (2) verify
ownership by loading the profile and checking
`profile.userId === req.user.claims.sub`, returning 403 otherwise. Mirror the
pattern already used by `GET /api/profiles/user/:userId`.

**Why:** profile ids are small sequential integers, so an open per-profile route
lets anyone enumerate other users' data. Code review flagged the dashboard routes
for exactly this.

**How to apply:** when adding `/api/.../:profileId` routes, copy the
load-profile → 404-if-missing → 403-if-not-owner guard before doing any work.

**Update:** the `/api/profiles` surface is now fully gated — `GET /api/profiles/:id`
has `isAuthenticated` + owner check, `POST /api/profiles` forces
`userId = claims.sub` (ignores body userId), and `PATCH /api/profiles/:id`
validates with `insertUserProfileSchema.partial()` then strips `userId`. Other
`:profileId` routes (e.g. `/api/stats/:profileId`, `/api/flashcards/due/:profileId`)
may still be open — check before trusting them.
