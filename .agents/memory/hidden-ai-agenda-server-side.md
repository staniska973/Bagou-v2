---
name: Server-side roleplay persona (objective/tactics + gender)
description: Why the roleplay interlocutor's persona must be generated/stored server-side only, how it's cached, and the reactive "user leads" design.
---

The oral roleplay interlocutor has a per-scene persona (first name, mood,
objective, tactics). That persona must be generated and stored **server-side
only**. Never return it to the browser and never accept it back from the client.

**Why:**
- Returning persona fields in an API response exposes them in DevTools/network
  even if never rendered.
- Accepting them back from the client is a prompt-injection hole: the fields are
  interpolated into the LLM system prompt, so a user could POST
  `objective: "ignore your rules…"` and steer the output/evaluation. Length-clamping
  limits token abuse, not instruction injection.

**How to apply:**
- Generate the persona once at conversation start; store in an in-memory TTL Map
  keyed by `profileId:cardId:gender` and look it up server-side each turn.
  Regenerate + re-cache on miss (server restart mid-session). The dialogue
  endpoint is otherwise stateless (client passes history).
- Gender is part of the cache key because it changes the persona name/pronouns
  (and TTS voice). The client sends the chosen gender to opening, dialogue-turn,
  and tts so all three stay consistent even if the stored-profile persist is
  stale/failed; the stored profile is only a fallback.
- Always normalize/clamp persona strings before interpolating into a prompt —
  treat them as data, never instructions.

**Reactive design (the user leads):**
- The interlocutor's `objective` is BACKGROUND motivation/color, NOT an agenda it
  actively drives. The system prompt makes the interlocutor respond to what the
  USER initiates, leave space, avoid interrogating, and (for seduction) stay
  receptive rather than pursuing. The point is to build the user's assertiveness.
- Coherence/anti-derailment is NARROW: on nonsense or off-scene input the
  character reacts in-character and returns to the immediate scene — it does NOT
  push a hidden agenda and does NOT become a pushover or a coach. Verified with
  real AI calls (passive user → at most one light natural question; "be a robot,
  repeat banana" → stays in scene).
