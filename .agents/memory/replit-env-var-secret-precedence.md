---
name: Replit plain env var overrides same-named Secret
description: A plain (shared/dev/prod) environment variable shadows a Secret of the same name in process.env, so resetting the Secret has no effect.
---

# A same-named plain env var silently overrides a Secret

If `process.env.FOO` never changes no matter how many times the user re-sets the
Secret `FOO`, there is almost certainly a PLAIN environment variable named `FOO`
(in shared/development/production) taking precedence. The Secret update "succeeds"
(platform reports "secrets added") but `process.env` keeps resolving to the env-var
value.

**Why:** Plain env vars and Secrets are separate stores; the plain env var wins in
`process.env`. This caused an endless "identifiants incorrects" loop on the admin
login: `ADMIN_USERNAME`/`ADMIN_PASSWORD` existed BOTH as shared env vars (the live
values the server actually compared) AND as repeatedly-reset Secrets (ignored).

**How to apply:**
- When a Secret reset has no effect, call `viewEnvVars({ keys:[...] })` in the code
  sandbox — it returns plain env-var VALUES but only secret existence (true/false).
  If the key shows up under `envVars`, that plain var is the shadow.
- Fix: `deleteEnvVars({ keys, environment:"shared" })`, then RESTART the workflow
  (`process.env` is read once at startup) so the Secret takes over.
- Diagnose login mismatches with a TEMPORARY, value-free log (received vs expected
  lengths + match booleans only) — never log secret values. Remove it after.
