---
name: AI latency tuning (Bagou)
description: How the per-turn / per-card AI latency was cut from 5-10s to ~1-1.5s — Gemini thinking budget, and not generating fields the client never reads.
---

## Gemini 2.5-flash is slow unless you disable "thinking"
`gemini-2.5-flash` runs with reasoning/thinking ON by default. A small scoring JSON
took **~7.6s**. Adding `config.thinkingConfig = { thinkingBudget: 0 }` drops it to
**~1.2s** with no quality loss for short structured outputs.

**Why:** This is the Gemini-native equivalent of OpenAI's `reasoning_effort: "minimal"`.
The two SDKs express it differently — OpenAI uses `reasoning_effort` on
`chat.completions`, Gemini uses `thinkingConfig.thinkingBudget` inside `config`.

**How to apply:** For any latency-sensitive Gemini call that emits a small/structured
response, set `thinkingBudget: 0`. Only `gemini-2.5-flash` can fully disable thinking
(2.5-pro cannot). With thinking off you can also lower `maxOutputTokens` (the huge
8192 cap existed to leave room for thinking tokens).

## Don't generate AI output the client never consumes
The vocal dialogue turn used to generate a full per-turn evaluation (model answer +
3 variants + a comment) on EVERY turn — ~250 extra output tokens and several wasted
seconds — yet the vocal client reads only `interlocutorReply`, `isFinalTurn`, and
(final turn) `globalDynamic`. Stripping it to a reply-only prompt roughly halved the
turn latency (~2.1s → ~1.1s).

**Why:** output tokens dominate LLM latency; generating unused JSON fields is pure
waste.

**How to apply:** Before adding fields to an LLM JSON schema, confirm a consumer
actually reads them. If a return-type field must stay for shape compatibility but is
no longer generated, return it as an empty stub and comment why.

## Realistic vocal end-to-end expectation
Even with an instant (extracted, no-LLM) opening and a ~1s lean reply, a true 1-2s
end-to-end vocal turn is bounded by the STT (transcribe) + TTS chain, which run
sequentially around the LLM call. The LLM portion is now ~1s; STT+TTS add the rest.
Set expectations accordingly — the win is 5-10s → ~3-4s, not literally 1-2s.
