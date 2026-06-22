---
name: GPT-5 API constraints (chat.completions)
description: Non-obvious request-param differences when using gpt-5* models via the OpenAI-compatible Replit AI integration.
---

GPT-5 family models (gpt-5, gpt-5-mini, gpt-5-nano) reject a custom `temperature`
on `chat.completions.create`. Only the default (`1`) is accepted; any other value
returns HTTP 400: "Unsupported value: 'temperature' does not support X with this
model. Only the default (1) value is supported."

**Why:** Swapping the chat model from `gpt-4o-mini` to `gpt-5-mini` broke every
OpenAI call that passed `temperature: 0.x`. Removing the `temperature` param fixed it.

**How to apply:** When moving an OpenAI chat call to a gpt-5* model, drop any
`temperature` param (or only send it for non-gpt-5 models). `max_completion_tokens`
is already the correct token param (gpt-5 rejects `max_tokens`). Gemini calls keep
their own temperature — this constraint is OpenAI gpt-5 only.

## `response_format: { type: "json_object" }` requires the literal word "json" in the prompt

Any call using `response_format: { type: "json_object" }` returns HTTP 400 unless
the messages contain the literal substring "json" (case-insensitive). OpenAI
enforces this. A 400 here is silent at the UX layer if the call is wrapped in a
try/catch with a fallback — the feature still "works" but always runs the fallback.

**Why:** The custom-situation composer prompt used json_object but never wrote the
word "json", so every AI call 400'd and the flow silently fell back. Adding "Réponds
UNIQUEMENT par un objet JSON valide …" to the prompt fixed it.

**How to apply:** Whenever you set `response_format: { type: "json_object" }`, make
sure the prompt explicitly says "json" (e.g. "respond with a JSON object"). If an
AI-JSON feature seems to always produce a generic/fallback result, suspect a
swallowed 400 from a missing-"json" prompt before anything else.
