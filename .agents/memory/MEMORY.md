# Memory Index

- [TypeScript checking is slow](ts-checking.md) — `npm run check` (tsc) exceeds the 120s bash cap in this repo; verify types with `getLatestLspDiagnostics` instead.
- [Card reply-leak detection](leak-detection.md) — present-tense 2nd-person speech act = leak; infinitive intent ("tu veux proposer") & channel verbs (écrire/envoyer) allowed; rewriter stubborn on present-tense premises.
- [E2E card/parcours flows](e2e-card-flows.md) — OIDC + onboarding gate; control due-queue size by inserting future-due srs_states for all-but-N cards (touches ~1440 rows, expected); onboarding redirect flaky.
- [GPT-5 API constraints](gpt5-api-constraints.md) — gpt-5* chat.completions reject custom temperature (only default 1); drop the param, keep max_completion_tokens.
