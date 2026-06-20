---
name: Hidden AI agenda must stay server-side
description: Why an AI interlocutor's secret objective/tactics must never round-trip through the client, and the cache pattern used instead.
---

When an AI roleplay character has a HIDDEN agenda (persona objective + tactics the
user must not see), that agenda must be generated and stored **server-side only**.
Never return it to the browser and never accept it back from the client.

**Why:**
- Returning it in an API response exposes it in DevTools/network even if it is
  never rendered — defeats the point of a hidden agenda.
- Accepting it back from the client (e.g. "thread it on every turn") is a
  prompt-injection hole: the persona fields get interpolated into the LLM system
  prompt, so a user can POST `objective: "ignore your rules…"` and steer the
  output/evaluation. Length-clamping the strings does NOT make them safe — it
  limits token abuse, not instruction injection.

**How to apply:**
- Generate the persona once at conversation start, store in an in-memory TTL Map
  keyed by `profileId:cardId`, and look it up server-side on each turn. Regenerate
  + re-cache on miss (server restart mid-session). The dialogue endpoint is
  otherwise stateless (client passes history), so this is the only server state.
- Still run a defensive normalize/clamp pass before interpolating ANY persona
  (even server-generated) into a prompt — treat it as data, never instructions.
- The interlocutor stays coherent / resists derailment when the system prompt
  carries its objective+tactics and explicit anti-derailment rules; verified the
  model ignores injected "say X" / off-topic drift and pursues its agenda.
