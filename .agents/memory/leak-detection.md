---
name: Card situation reply-leak detection (Bagou)
description: The semantic rules that define what counts as a "reply leak" in a card situation, and how the detector/rewriter must treat them.
---

A card `situation` must set the scene + quote the INTERLOCUTOR, but never script,
quote, or paraphrase the USER's own reply. The shared detector/rewriter live in
`server/leak-detection.ts`; the detector also gates generation (fail-closed) and
the admin "Vérifier les fuites" tool.

The core semantic line (drives every detector rule and the rewriter prompt):

- **Present-tense 2nd-person speech act = LEAK.** "tu proposes une remise", "tu
  annonces ton départ", "tu expliques ton retard" reveal the user's reply even
  with no quote/colon/"que". Detected via a high-risk-verb + content-object rule
  (verb directly followed by a possessive/article/demonstrative object, with an
  optional "à/au/aux" recipient in between).
- **Intent with an infinitive = ALLOWED scene-setting.** "tu veux proposer une
  remise", "tu comptes annoncer …" only state the goal, not the words. The
  detector deliberately fires on present forms only.
- **Medium/channel verbs = ALLOWED.** "tu écris à un client", "tu envoies un
  message à Paul" name the channel, not content — keep écrire/envoyer out of the
  high-risk content-verb set.
- Interlocutor's own quoted line (attributed via a 3rd-person speech verb or a
  colon whose introducer isn't a 2nd-person verb) is OK; a dangling quote after
  a user action ("tu écris …. « … »") is a leak.

**Why:** two code-review rejections — the detector first only fired on a
quote/colon/"que" marker and missed paraphrased intent leaks. Broadening it is
what the reviewer required.

**How to apply:** when editing the detector, preserve the present-vs-infinitive
distinction (it is the whole design, not an accident) and run the tsx spec
`server/leak-detection.test.ts` (no jest/vitest installed). The AI rewriter
(gpt-4o-mini) is stubborn on cards whose *premise* is a present-tense speech act
("tu proposes une collaboration …") and can fail to convert them even after many
retries — fall back to the safe deterministic present→intent reframe
("tu proposes X" → "tu veux proposer X").
