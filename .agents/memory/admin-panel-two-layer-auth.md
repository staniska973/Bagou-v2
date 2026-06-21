---
name: Admin panel two-layer auth (for UI testing)
description: /admin sits behind BOTH Replit OAuth and a separate admin session — how to reach it in Playwright tests.
---

# Admin panel is behind two auth layers

`/admin` only renders after the app-wide Replit OAuth gate passes (`AppContent` in
`client/src/App.tsx` shows the public Landing page when `useAuth` has no user).
THEN the admin page (`client/src/pages/admin.tsx`) does its own separate
username/password session check (`GET /api/admin/check`, login `POST /api/admin/login`).

**Why:** A `runTest` plan that only does the admin form login fails — the agent
never passes the OAuth gate, so it just sees the public landing page and the admin
login form never renders (set-cookie also looks "missing" because the page is wrong).

**How to apply (testing skill):**
- Call `runTest({ testReplitAuth: true, ... })`.
- Step order: `[OIDC]` configure next login claims → navigate `/` → click "Se connecter"
  to complete OAuth → navigate `/admin` → fill `input-admin-username` /
  `input-admin-password` → click `button-admin-login` → then the dashboard renders.
- Admin creds live in env `ADMIN_USERNAME` / `ADMIN_PASSWORD` (read via viewEnvVars in
  the code sandbox; `process.env` is NOT exposed inside the code_execution sandbox).
- Session cookie is `secure: true`; the testReplitAuth OAuth flow goes through the
  HTTPS preview proxy so cookies are set correctly. Plain HTTP/localhost drops them.
