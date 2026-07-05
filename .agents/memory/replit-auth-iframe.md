---
name: Replit OAuth login can't run inside the preview iframe
description: Why login/logout must open in a NEW TAB when the app is embedded in the Replit preview
---

# Replit OAuth login/logout cannot run inside the preview iframe

Symptom(s), in the Replit **preview pane** (which embeds the app in a sandboxed
iframe):
1. A plain link/redirect to `/api/login` loads replit.com's OAuth page **inside**
   the iframe → browser shows **"replit.com refused to connect" / "n'autorise pas
   la connexion"** (replit.com sends framing-deny headers).
2. Trying to break out with `target="_top"` or `(window.top).location.href` does
   **nothing at all** — the preview iframe sandbox blocks top-level navigation,
   silently. No request reaches the server (confirm via workflow logs: no
   `GET /api/login`).

So there is **no way to run the OAuth flow inside the preview iframe**. Both
framing it and navigating out are blocked.

**Working fix:** detect embedding and open auth in a NEW TAB, which the sandbox
does allow (user-gesture `window.open`). Outside an iframe (deployed app, or app
opened in its own browser tab) navigate normally in the same tab. Centralized in
`client/src/lib/auth-utils.ts` as `goToAuth(path)`:
- `inIframe = window.self !== window.top` (wrap in try/catch — cross-origin access
  can throw, which itself means framed).
- if framed: `const w = window.open(path, "_blank")` (do NOT pass `"noopener"` —
  it forces the return value to `null`, defeating the popup-blocked check); then
  `if (w) w.opener = null; else <top-nav fallback>`.
- else: `window.location.href = path`.

Anchors call it via `onClick={(e) => { e.preventDefault(); goToAuth("/api/login") }}`
(keep the `href` for accessibility / right-click). Used for `/api/login` AND
`/api/logout` everywhere (landing, use-auth, settings, redirectToLogin).

**Why safe in prod:** deployed app is not iframed ⇒ `window.self === window.top`
⇒ normal same-tab navigation, no popup.

**How to apply:** never use a plain `<a href>` or `window.location.href` for a
Replit auth/OAuth redirect — always route through `goToAuth`. If the user still
can't log in from the editor, tell them to open the app in its own browser tab.
