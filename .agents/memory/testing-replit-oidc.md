---
name: Testing blocked by Replit OIDC consent
description: Automated browser E2E refuses to run on this app's login; how to verify instead.
---

The testing skill's browser agent refuses to proceed when it reaches the Replit OIDC
external OAuth consent page — even with `testReplitAuth: true`. It classifies the
consent screen as third-party OAuth and blocks ALL further testing for the session.
Once blocked, it stays blocked ("Testing was blocked earlier") — do NOT keep retrying
`runTest`.

**Why:** core features sit behind Replit login (`javascript_log_in_with_replit`), and
the agent will not click through an external OAuth consent step.

**How to apply:** fall back to verifying the backend with `curl` against the running
dev server on `http://localhost:5000` (AI/auth-light endpoints often aren't gated), and
rely on `tsc --noEmit` for the client. Parse JSON responses with `node` — `python3` is
NOT available in this environment. For endpoints gated by `isAuthenticated`, curl from
the server side won't carry a session, so verify those by typecheck + the running app's
own logs instead.
