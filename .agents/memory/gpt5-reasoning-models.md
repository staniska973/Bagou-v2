---
name: GPT-5 reasoning models & reasoning_effort
description: Why gpt-5-mini/gpt-5 chat calls return empty content unless reasoning_effort is set; how to avoid it.
---

# GPT-5 reasoning models silently return empty output under tight token budgets

GPT-5 family models (e.g. `gpt-5-mini`) are **reasoning models**: by default they spend
`max_completion_tokens` on internal reasoning tokens BEFORE producing visible content. With a
small budget (a few hundred tokens) reasoning eats the whole budget and the response comes back
with `finish_reason: "length"`, `content` length 0, and `usage.completion_tokens_details.reasoning_tokens`
equal to the full budget. Downstream `|| "..."` / `|| ""` fallbacks then surface as blank UI
(this caused the Bagou "three little dots" vocal-simulation bug).

**Rule:** for short or JSON-shaped outputs on gpt-5 chat.completions, always pass
`reasoning_effort: "minimal"`. With minimal effort `reasoning_tokens` drops to 0, the existing
token budget becomes pure output budget, latency drops, and content is valid.

**Why:** migrating a previously non-reasoning model to gpt-5-mini without `reasoning_effort`
broke every text output across the app at once. Confirmed by live API test: same prompt/budget,
`reasoning_tokens` 300→0 and content length 0→full after adding `reasoning_effort: "minimal"`.

**How to apply:**
- Set it on every gpt-5 `chat.completions.create` that expects a short answer or JSON.
- Do NOT add `temperature` to gpt-5 calls — it returns HTTP 400 (unsupported).
- openai SDK ≥ 6.18 types `reasoning_effort` (`Shared.ReasoningEffort`: none|minimal|low|medium|high|xhigh|null).
- The Replit AI integration env vars (`AI_INTEGRATIONS_OPENAI_API_KEY`/`_BASE_URL`) are NOT visible
  in the code_execution sandbox (`process.env` is undefined there; viewEnvVars redacts secret values).
  To live-test real AI calls, run a throwaway `tsx` script via bash (real Node has the env), then delete it.
