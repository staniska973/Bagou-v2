---
name: Authed E2E is blocked
description: Why authenticated routes can't be verified with the screenshot/testing tools in this repl, and what to do instead.
---

# Authenticated routes can't be screenshotted / E2E-tested here

This app gates real pages behind Replit OIDC login. The `screenshot` (app_preview) tool and the Playwright testing subagent run in a browser that is **not** logged in through the OIDC consent flow, so:

- `app_preview` of an authed route (e.g. `/`, `/parcours`) renders the **landing/login page**, not the real UI, and shows a `401` for `/api/auth/user`.
- The testing skill cannot drive logged-in flows.

**How to verify instead:** rely on `npx tsc --noEmit` (filter to `client/src` — there are pre-existing errors in `server/replit_integrations`), the `Start application` workflow logs (the real user's authenticated requests show up there with 200/304), and reading the code / architect review. Don't burn time trying to screenshot authed pages.
