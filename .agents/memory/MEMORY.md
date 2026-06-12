# Memory Index

- [Parcours SRS rule](srs-parcours-design.md) — written self-rating is the only canonical SM-2 event; oral may only downgrade, never advance.
- [Authed E2E is blocked](replit-oauth-e2e-block.md) — screenshot/testing tools aren't logged in via Replit OIDC; verify authed routes via tsc + workflow logs, not app_preview.
- [Long-running jobs](long-running-jobs.md) — bash-backgrounded processes die on return; run >2min bulk AI/DB work as a console workflow + resumable state file.
