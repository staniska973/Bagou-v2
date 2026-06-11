---
name: Admin panel authentication
description: Admin uses a completely separate session from Replit OAuth; uses isAdminSession middleware.
---

## Rule
The admin panel at `/admin` has its own session-based authentication, completely independent from Replit OAuth:
- Login: `POST /api/admin/login` — checks `ADMIN_USERNAME` + `ADMIN_PASSWORD` env vars
- Session check: `GET /api/admin/check` — returns `{ ok: true }` if logged in
- All admin API routes use `isAdminSession` middleware (NOT `isAuthenticated`)
- Frontend: Admin component checks `/api/admin/check` and shows AdminLogin if not authenticated

**Why:** Admin access should not be tied to Replit OAuth to allow non-Replit-account admins and to avoid exposing admin features to all authenticated users.

**How to apply:** Never protect admin routes with `isAuthenticated`. Always use `isAdminSession`. When adding new admin routes, follow the pattern in routes.ts.
