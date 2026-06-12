---
name: Long-running background jobs
description: How to run jobs longer than the bash timeout (bulk AI/DB work) without them being killed.
---

# Long-running jobs (bulk AI / DB work)

The `bash` tool has a hard max timeout of 120s, and any process you background from it
(`nohup ... &`) is **killed when the bash command returns** — it does not survive into the
next call. Confirmed by a bulk card-regeneration job that silently died right after launch.

**Rule:** for jobs that take more than ~2 minutes (e.g. regenerating many cards via per-batch
AI calls), do NOT background a script from bash. Instead run it as a managed workflow:
`configureWorkflow({ name, command: "npx tsx scripts/<job>.ts", outputType: "console", autoStart: true })`
(omit `waitForPort` — the script doesn't listen on a port). The workflow persists across bash
calls; poll progress with `getWorkflowStatus` and remove it with `removeWorkflow` when done.

**Why:** the sandbox tears down the bash command's child process group on return, so detached
background processes never make real progress.

**How to apply:** also make the job **resumable** — write completed units to a small state file
(e.g. `/tmp/<job>-state.json`, atomic write+rename) and skip them on rerun. Then a restart or an
interruption mid-run just retries unfinished units instead of corrupting data. Use bounded
concurrency (a worker pool of ~8 pulling from a cursor) to finish faster while limiting parallel
AI calls.
