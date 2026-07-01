---
name: Replit OAuth login can't be iframed
description: Why login/logout links must break out of the preview iframe (target=_top / window.top)
---

# Replit OAuth login/logout refuses to be framed

Symptom: inside the Replit **preview pane** (which embeds the app in an iframe),
clicking "login" shows the browser error **"replit.com n'autorise pas la
connexion" / "replit.com refused to connect"**. The server `/api/login` is fine
(it 302-redirects to Replit's OAuth page); the OAuth page itself sends
framing-deny headers, so it can't render inside the iframe.

**Fix:** login/logout navigations must target the **top-level** browsing context,
not the app iframe:
- Anchor tags: add `target="_top"` (e.g. `<a href="/api/login" target="_top">`).
- JS redirects: `(window.top ?? window).location.href = "/api/login"` (same for
  `/api/logout`). Assigning `location.href` on a cross-origin `window.top` is a
  permitted navigation; only *reading* cross-origin `top.location` throws.

**Why it's safe:** in a deployed / directly-opened app there is no iframe, so
`_top` === the current window and `window.top === window` — the change is a no-op
in production.

**How to apply:** whenever adding a login/logout/OAuth redirect, never use plain
`window.location.href` or a default-target `<a>`; break out to the top window.
Residual caveat: a strict iframe `sandbox` can still block top navigation — if the
user still sees the error in Preview, tell them to open the app in a new browser
tab, where login always works.
