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

# Orphaned-avatar reconciliation

Avatar cleanup on account-delete and photo replace/clear is intentionally
best-effort (logs + moves on), so a transient storage outage can permanently
orphan a file. The safety net is `reconcileOrphanedAvatars()` (`server/avatar-reconciliation.ts`):
lists everything under the `uploads/` prefix (`ObjectStorageService.listUploadedAvatarPaths()`)
and deletes any path not in the set of live `users.customImageUrl` values.
**Why:** orphans accumulate silently and cost storage with no other way to find them.
**How to apply:** compare on the normalized `/objects/...` form (live URLs may be
full `storage.googleapis.com` URLs — run them through `normalizeObjectEntityPath`).
Idempotent; never deletes a referenced object. Runs ~60s after boot + daily via
`setInterval` in `server/index.ts`, and on demand via `POST /api/admin/avatars/reconcile`.

**Grace period:** the sweep skips orphans whose storage `timeCreated` is younger
than a grace period (default 1h, `DEFAULT_AVATAR_GRACE_PERIOD_MS`, overridable per
call via `gracePeriodMs` or globally via `AVATAR_RECONCILE_GRACE_MS` env, ms).
**Why:** closes the upload→claim race — a file uploaded via presigned URL whose
`PUT /api/account/profile-image` claim hasn't landed yet would otherwise be deleted.
`listUploadedAvatarPaths()` returns `{path, timeCreated}` (creation time from GCS
`file.metadata.timeCreated`, the listing populates it). A null/unknown `timeCreated`
is NOT protected — treated as an ordinary orphan and deleted, so missing metadata
can't block cleanup. `reconcileOrphanedAvatars` takes a `now` clock for testing.
