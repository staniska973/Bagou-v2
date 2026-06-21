---
name: Object storage on Express 5
description: Gotchas wiring the Replit object-storage blueprint into this Express 5 app, plus the custom-avatar fallback convention.
---

# Object storage + Express 5

The Replit `javascript_object_storage` blueprint ships a serving route written as
`app.get("/objects/:objectPath(*)", ...)`. This codebase runs **Express 5**, whose
path-to-regexp (v8) rejects the `(*)` suffix syntax and crashes at boot with
`Missing parameter name`. Fix: use the Express 5 named-wildcard form
`app.get("/objects/*objectPath", ...)`. The handler reads `req.path` directly so the
param name is irrelevant.

**Why:** path-to-regexp v8 changed wildcard syntax; the blueprint template is still v4-era.
**How to apply:** any time you copy a blueprint route with `:x(*)` / `(.*)` into this repo, convert to `*name`.

# Custom avatar convention

User-uploaded avatars live on `users.customImageUrl` (object path like
`/objects/uploads/<uuid>`), set via `PUT /api/account/profile-image` after a presigned
upload. UI everywhere falls back: `user.customImageUrl || user.profileImageUrl`
(OAuth avatar). Login upsert never writes customImageUrl, so it survives re-login.
