---
name: TypeScript checking is slow
description: How to type-check this repo without hitting the bash timeout.
---

Running the full project type-check (`npm run check`, i.e. `tsc`) takes longer than the 120s cap on the bash tool, so it usually times out and is not a reliable way to verify changes.

**Why:** The project is large (client + server + shared) and the single tsc pass over everything is slow.

**How to apply:** Use the diagnostics skill's `getLatestLspDiagnostics({ filePath })` (via code_execution) to check edited files for type errors. The dev server runs under `tsx` (no type-checking at runtime), so a clean boot does not prove types are sound — rely on LSP diagnostics for that.
