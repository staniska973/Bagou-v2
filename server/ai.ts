import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import type { UserProfile, MotherCard, Scenario } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const GPT_MODEL = "gpt-5-mini";
const GEMINI_MODEL = "gemini-2.5-flash";
const SCORING_PROVIDER = (process.env.SCORING_MODEL || "gemini") as "gpt" | "gemini";
const GENERATION_PROVIDER = (process.env.GENERATION_MODEL || "gpt") as "gpt" | "gemini";

const BASE_BAGOU_SYSTEM = `Tu es le coach Bagou. Philosophie :
- RÉFLEXE, pas monologue. Chaque réponse = 1 à 2 phrases MAX. Percutante. Tranchante.
- On ne se justifie JAMAIS. On ne s'excuse pas d'exister.
- Le silence est une arme. La concision est le pouvoir.
- On ose l'inconfort. On recadre sans agressivité mais sans faiblesse.
- Ton direct, piquant, parfois provocateur. Zéro langue de bois.
- Pas de "je comprends que tu ressentes..." ni de formules thérapeutiques molles.
- Style : comme les signatures Bagou → "On ne négocie pas le respect." / "On garde son cadre." / "On ne retient personne."
- Langue : français exclusivement, registre courant/familier naturel (pas soutenu).`;

export interface AIRuntimeConfig {
  scoringProvider: "gpt" | "gemini";
  generationProvider: "gpt" | "gemini";
  bagouSystemExtra: string;
  dialogueTurns: number;
}

let _runtimeConfig: AIRuntimeConfig = {
  scoringProvider: SCORING_PROVIDER,
  generationProvider: GENERATION_PROVIDER,
  bagouSystemExtra: "",
  dialogueTurns: 3,
};

export function updateAIRuntimeConfig(config: Partial<AIRuntimeConfig>) {
  Object.assign(_runtimeConfig, config);
}

export function getAIRuntimeConfig(): AIRuntimeConfig {
  return { ..._runtimeConfig };
}

function getBagouSystem(): string {
  const extra = _runtimeConfig.bagouSystemExtra;
  return extra ? `${BASE_BAGOU_SYSTEM}\n\n${extra}` : BASE_BAGOU_SYSTEM;
}

const BAGOU_SYSTEM = BASE_BAGOU_SYSTEM;

interface FlashcardGenerationResponse {
  modelAnswer: string;
  variants: {
    safe: string;
    medium: string;
    bold: string;
  };
  rubric: string[];
}

interface FlashcardScoringResponse {
  pass: boolean;
  ratingSuggested: "hard" | "medium" | "easy";
  oneFix: string;
  redoPrompt: string;
  feedback: string;
}

interface RoleplayTurnResponse {
  aiMessage: string;
  stop: boolean;
  internalThought?: string;
}

interface DebriefResponse {
  strengths: string[];
  improvement: string;
  optimizedRewrite: string;
  redoExercise: string;
  scores: {
    clarity: number;
    frame: number;
    tone: number;
    concision: number;
  };
}

export async function generateModelAnswer(
  profile: UserProfile,
  card: MotherCard,
  userAnswer: string
): Promise<FlashcardGenerationResponse> {
  const prompt = `Génère une réponse modèle et 3 variantes pour cette situation.

RÈGLES ABSOLUES :
- Réponse modèle = 1 à 2 phrases MAX. Pas un mot de plus.
- Variante "safe" = version prudente mais ferme (1 phrase)
- Variante "medium" = version directe et assurée (1-2 phrases)  
- Variante "bold" = version audacieuse, piquante, qui déstabilise (1-2 phrases)
- Rubrique = 3 critères courts pour évaluer (ex: "Pas de justification", "Ton stable", "Silence après")

Profil : ton=${profile.tonePrimary}, risque=${profile.riskLevel}, tutoiement=${profile.tuVous}
Situation : ${card.situation}
Objectif : ${card.userGoal}
À éviter : ${card.antiPatterns?.join(", ") || "aucun"}
Vibe cible : ${card.targetVibe}
L'utilisateur a écrit : "${userAnswer}"

JSON:
{"modelAnswer":"...","variants":{"safe":"...","medium":"...","bold":"..."},"rubric":["...","...","..."]}`;

  const start = Date.now();
  console.log(`[AI] generateModelAnswer: calling ${GPT_MODEL}...`);

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: BAGOU_SYSTEM },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: 300,
  });

  const elapsed = Date.now() - start;
  const content = response.choices[0]?.message?.content || "{}";
  console.log(`[AI] generateModelAnswer: ${elapsed}ms, content length=${content.length}`);

  try {
    const parsed = JSON.parse(content);
    return {
      modelAnswer: parsed.modelAnswer || "Réponse non générée",
      variants: parsed.variants || { safe: "", medium: "", bold: "" },
      rubric: parsed.rubric || [],
    };
  } catch (e) {
    console.error("[AI] Failed to parse model answer response:", content);
    return {
      modelAnswer: "Impossible de générer la réponse",
      variants: { safe: "", medium: "", bold: "" },
      rubric: [],
    };
  }
}

export async function scoreUserAnswer(
  profile: UserProfile,
  card: MotherCard,
  userAnswer: string,
  modelAnswer: string
): Promise<FlashcardScoringResponse> {
  const prompt = `Évalue la réponse de l'utilisateur à cette situation de communication.

SITUATION : ${card.situation}
OBJECTIF : ${card.userGoal}
À ÉVITER : ${card.antiPatterns?.join(", ") || "aucun"}
Réponse modèle : "${modelAnswer}"
Réponse utilisateur : "${userAnswer}"
Profil : ton=${profile.tonePrimary}, risque=${profile.riskLevel}

QUAND ÉCHOUER (pass=false, ratingSuggested="hard") — UNIQUEMENT si :
- L'utilisateur se JUSTIFIE, s'EXCUSE ou se SOUMET ("désolé", "non mais en fait...", "t'as raison...")
- L'utilisateur tombe dans un anti-pattern listé ci-dessus
- La réponse est un PAVÉ de plus de 4 phrases
- L'utilisateur FUIT la situation ou ne répond pas à l'objectif

QUAND VALIDER (pass=true) :
- ratingSuggested="medium" : La réponse tient le cadre et ne tombe dans aucun anti-pattern. Elle va dans la bonne direction même si elle manque de punch ou est un peu longue (3 phrases ok).
- ratingSuggested="easy" : La réponse est courte (1-2 phrases), percutante, tient le cadre parfaitement. Style Bagou.

IMPORTANT : L'utilisateur APPREND. Une réponse qui va dans le bon sens SANS se justifier ni s'excuser = pass. On réserve l'échec aux vrais anti-patterns, pas au manque de style.

RÈGLES DE FORMAT :
- feedback = 1 phrase directe style Bagou. Si pass=true, souligne ce qui est bien ET ce qui peut être amélioré. Si pass=false, dis pourquoi c'est raté sans ménagement.
- oneFix = 1 conseil concret en une phrase
- redoPrompt = reformulation courte si raté, vide si réussi

JSON:
{"pass":true,"ratingSuggested":"medium","oneFix":"...","redoPrompt":"...","feedback":"..."}`;

  const start = Date.now();
  const provider = SCORING_PROVIDER;
  console.log(`[AI] scoreUserAnswer: calling ${provider === "gemini" ? GEMINI_MODEL : GPT_MODEL}...`);

  let content: string;

  if (provider === "gemini") {
    const fullPrompt = `${BAGOU_SYSTEM}\n\n${prompt}`;
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    });
    content = response.text || "{}";
  } else {
    const response = await openai.chat.completions.create({
      model: GPT_MODEL,
      messages: [
        { role: "system", content: BAGOU_SYSTEM },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      reasoning_effort: "minimal",
      max_completion_tokens: 250,
    });
    content = response.choices[0]?.message?.content || "{}";
  }

  const elapsed = Date.now() - start;
  console.log(`[AI] scoreUserAnswer (${provider}): ${elapsed}ms`);

  try {
    const parsed = JSON.parse(content);
    return {
      pass: parsed.pass ?? false,
      ratingSuggested: parsed.ratingSuggested || "medium",
      oneFix: parsed.oneFix || "",
      redoPrompt: parsed.redoPrompt || "",
      feedback: parsed.feedback || "",
    };
  } catch (e) {
    console.error("[AI] Failed to parse scoring response:", content);
    return {
      pass: false,
      ratingSuggested: "medium",
      oneFix: "Évaluation indisponible",
      redoPrompt: "",
      feedback: "Évaluation indisponible",
    };
  }
}

export async function generateRoleplayTurn(
  profile: UserProfile,
  scenario: Scenario,
  history: { role: string; content: string }[],
  userMessage: string
): Promise<RoleplayTurnResponse> {
  const turnCount = history.filter((m) => m.role === "user").length + 1;
  const isNearEnd = turnCount >= (scenario.turnsMin || 6);

  const systemPrompt = `${BAGOU_SYSTEM}

ROLEPLAY : Tu joues "${scenario.aiName}". Tu n'es PAS le coach, tu es le personnage.
Contexte : ${scenario.context}
Persona : ${scenario.aiPersona}. Position : ${scenario.aiStance}.
Arc narratif : ouverture=${scenario.phase1}, résistance=${scenario.phase2}, résolution=${scenario.phase3}.
Tour ${turnCount}. ${isNearEnd ? "Fin proche, conclus naturellement." : ""}

RÈGLES DU PERSONNAGE :
- Tu testes l'utilisateur. Tu es provocateur, manipulateur ou condescendant selon le scénario.
- Tu ne facilites PAS la tâche. Tu résistes, tu piques, tu déstabilises.
- Tes répliques font 1-3 phrases MAX. Naturel, oral, pas littéraire.
- Si l'utilisateur te recadre bien → tu cèdes progressivement (arc).
- Si l'utilisateur est mou → tu en rajoutes, tu pousses.
- JSON: {"aiMessage":"...","stop":false,"internalThought":"..."}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const start = Date.now();
  console.log(`[AI] generateRoleplayTurn: calling ${GPT_MODEL}, turn ${turnCount}...`);

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages,
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: 250,
  });

  const elapsed = Date.now() - start;
  const content = response.choices[0]?.message?.content || "{}";
  console.log(`[AI] generateRoleplayTurn: ${elapsed}ms`);

  try {
    return JSON.parse(content);
  } catch (e) {
    console.error("[AI] Failed to parse roleplay response:", content);
    return { aiMessage: "...", stop: false };
  }
}

export async function generateDebrief(
  profile: UserProfile,
  transcript: string | { role: string; content: string }[]
): Promise<DebriefResponse> {
  const transcriptText = Array.isArray(transcript)
    ? transcript.map((m) => `${m.role === "user" ? "UTILISATEUR" : "IA"}: ${m.content}`).join("\n")
    : transcript;

  const prompt = `Débriefe ce roleplay. Style Bagou : direct, percutant, pas de blabla.

Profil : ton=${profile.tonePrimary}, risque=${profile.riskLevel}

Transcription :
${transcriptText}

RÈGLES :
- strengths : 2 points forts en UNE phrase chacun, style punchline ("Tu as tenu ton cadre sans ciller")
- improvement : 1 axe d'amélioration en UNE phrase directe, pas de ménagement
- optimizedRewrite : réécris la plus faible réponse de l'utilisateur en version Bagou (1-2 phrases MAX)
- redoExercise : 1 exercice concret à refaire (1 phrase)
- scores : 0-100 pour clarté, cadre, ton, concision. Sois sévère.

SIGNATURE FINALE : Termine improvement par une signature Bagou (ex: "On ne négocie pas sa place.")

JSON:
{"strengths":["...","..."],"improvement":"...","optimizedRewrite":"...","redoExercise":"...","scores":{"clarity":75,"frame":80,"tone":70,"concision":65}}`;

  const start = Date.now();
  console.log(`[AI] generateDebrief: calling ${GPT_MODEL}...`);

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: BAGOU_SYSTEM },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: 400,
  });

  const elapsed = Date.now() - start;
  const content = response.choices[0]?.message?.content || "{}";
  console.log(`[AI] generateDebrief: ${elapsed}ms`);

  try {
    const parsed = JSON.parse(content);
    return {
      strengths: parsed.strengths || [],
      improvement: parsed.improvement || "",
      optimizedRewrite: parsed.optimizedRewrite || "",
      redoExercise: parsed.redoExercise || "",
      scores: {
        clarity: parsed.scores?.clarity ?? 50,
        frame: parsed.scores?.frame ?? 50,
        tone: parsed.scores?.tone ?? 50,
        concision: parsed.scores?.concision ?? 50,
      },
    };
  } catch (e) {
    console.error("[AI] Failed to parse debrief response:", content);
    return {
      strengths: [],
      improvement: "",
      optimizedRewrite: "",
      redoExercise: "",
      scores: { clarity: 50, frame: 50, tone: 50, concision: 50 },
    };
  }
}

export interface TurnEvaluation {
  score: "weak" | "ok" | "strong";
  comment: string;
  modelAnswer: string;
  variants: { safe: string; medium: string; bold: string };
}

export interface GlobalDynamic {
  feedback: string;
  rating: "hard" | "medium" | "easy";
  pattern: string;
}

export interface DialogueTurnResult {
  turnEval: TurnEvaluation;
  interlocutorReply: string;
  isFinalTurn: boolean;
  globalDynamic?: GlobalDynamic;
}

export async function generateOpeningLine(
  card: MotherCard,
  profile: UserProfile | null | undefined
): Promise<string> {
  const prompt = `Tu joues le rôle de : "${card.otherRole}"
Relation avec l'utilisateur : ${card.relationship}
Situation : ${card.situation}
Enjeu : ${card.stakes}
${profile?.tuVous === "vous" ? "Utilise le vouvoiement." : "Utilise le tutoiement."}

Ta PREMIÈRE ligne concrète pour lancer la scène. C'est ce que TU dis à l'utilisateur pour déclencher la situation.
1 à 2 phrases MAX. Direct, réaliste, oral. Parle directement à la personne en face de toi.

RÈGLE ABSOLUE : tu n'es QUE l'interlocuteur "${card.otherRole}". Tu ne souffles jamais, ne suggères jamais et ne formules jamais à la place de l'utilisateur ce qu'il devrait te répondre. Aucun conseil, aucun coaching, aucun exemple de réponse, aucun méta-commentaire — uniquement ta réplique d'interlocuteur.`;

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      {
        role: "system",
        content: "Tu joues UNIQUEMENT le personnage de l'interlocuteur dans une mise en scène pédagogique. Tu ne dis JAMAIS la réplique de l'utilisateur ni le moindre indice sur ce qu'il devrait répondre : tu lui lances seulement la situation. Réponds UNIQUEMENT avec ta réplique d'ouverture, sans guillemets ni préfixe. Langue : français.",
      },
      { role: "user", content: prompt },
    ],
    reasoning_effort: "minimal",
    max_completion_tokens: 80,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

export async function generateDialogueTurnWithEval(
  profile: UserProfile,
  card: MotherCard,
  history: { role: "user" | "assistant"; content: string }[],
  userMessage: string,
  turnNumber: number,
  maxTurns: number = 3
): Promise<DialogueTurnResult> {
  const isFinalTurn = turnNumber >= maxTurns;
  const lastInterlocutorMsg = [...history].reverse().find((m) => m.role === "assistant")?.content || "";

  const jsonSchema = isFinalTurn
    ? `{"turnEval":{"score":"ok","comment":"...","modelAnswer":"...","variants":{"safe":"...","medium":"...","bold":"..."}},"interlocutorReply":"...","globalDynamic":{"feedback":"...","rating":"medium","pattern":"..."}}`
    : `{"turnEval":{"score":"ok","comment":"...","modelAnswer":"...","variants":{"safe":"...","medium":"...","bold":"..."}},"interlocutorReply":"..."}`;

  const systemPrompt = `${getBagouSystem()}

Tu joues deux rôles simultanément dans un exercice de communication :

SITUATION : "${card.situation}"
Rôles : L'utilisateur = "${card.speakerRole}" / Interlocuteur = "${card.otherRole}"
Relation : ${card.relationship} | Enjeux : ${card.stakes}
Objectif de l'utilisateur : ${card.userGoal}
Anti-patterns à éviter : ${card.antiPatterns?.join(", ") || "aucun"}
${lastInterlocutorMsg ? `\nDERNIÈRE RÉPLIQUE DE L'INTERLOCUTEUR (à laquelle l'utilisateur répond MAINTENANT) :\n"${lastInterlocutorMsg}"` : ""}

---
RÔLE 1 — ÉVALUATEUR BAGOU (tu évalues la réplique de l'utilisateur pour CE tour précis) :

RÈGLES DE SCORE — applique dans cet ordre, sans exception :
1. score "weak" OBLIGATOIRE si : réponse d'un ou deux mots seuls ("oui", "non", "ok", "ouais", "peut-être", "d'accord", "bien sûr", "pourquoi pas") / l'utilisateur se justifie ou s'excuse / la réponse ne répond PAS à la dernière réplique de l'interlocuteur / fuite ou changement de sujet / réponse vague qui ne fait pas avancer l'objectif
2. score "ok" si : la réponse va dans le bon sens, ne tombe dans aucun anti-pattern, mais manque de punch, est trop longue, ou reste en surface
3. score "strong" SEULEMENT si : 1-2 phrases MAX, directe, assertive, tient le cadre, répond précisément à la dernière réplique ET fait avancer l'objectif

- comment : 1 phrase Bagou tranchante. Si weak → nomme le problème sans ménagement. Si strong → valide avec élan.
- modelAnswer : Réponse idéale en réaction DIRECTE à la dernière réplique de l'interlocuteur ci-dessus. 1-2 phrases. Oral, naturel, style Bagou. Elle DOIT logiquement répondre à ce que l'interlocuteur vient de dire.
- variants : 3 alternatives ancrées sur LA MÊME dernière réplique (safe = prudente mais ferme, medium = directe, bold = piquante). Chaque variante est une réponse cohérente à cette dernière réplique.

RÔLE 2 — INTERLOCUTEUR (tu joues "${card.otherRole}") :
- Tu réagis naturellement à ce que vient de dire l'utilisateur
- Ton réaliste : ni trop facile, ni agressif. Tu testes, tu résistes, tu relances.
- 1-2 phrases maximum. Oral et naturel.
- RÈGLE ABSOLUE : "interlocutorReply" ne contient QUE les mots que l'interlocuteur dit à voix haute. JAMAIS la réponse attendue de l'utilisateur, jamais un conseil, un indice, un exemple de formulation ou un coaching. La réponse modèle et les variantes restent EXCLUSIVEMENT dans "turnEval" (le seul champ dit à voix haute est "interlocutorReply").
${!isFinalTurn ? `- IMPÉRATIF : ne ferme JAMAIS la conversation. Pose une question, exprime un doute, fais une remarque qui oblige l'utilisateur à répondre. L'échange doit continuer.` : `- C'est le dernier tour : tu peux conclure naturellement.`}
${isFinalTurn ? `
RÔLE 3 — BILAN FINAL (c'est le dernier tour, analyse l'ensemble de l'échange) :
- feedback : 1-2 phrases sur la dynamique globale observée dans l'échange entier
- rating : "easy" si maîtrisé globalement / "medium" si correct mais perfectible / "hard" si l'utilisateur a globalement raté l'objectif
- pattern : Pattern récurrent observé (ex: "tu tends à sur-expliquer", "bonne assertivité globale", "montée en puissance progressive")
` : ""}
Réponds UNIQUEMENT en JSON avec ce format : ${jsonSchema}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const start = Date.now();
  console.log(`[AI] generateDialogueTurnWithEval: turn ${turnNumber}/${maxTurns}, isFinal=${isFinalTurn}`);

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages,
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: isFinalTurn ? 600 : 350,
  });

  const elapsed = Date.now() - start;
  const content = response.choices[0]?.message?.content || "{}";
  console.log(`[AI] generateDialogueTurnWithEval: ${elapsed}ms`);

  try {
    const parsed = JSON.parse(content);
    return {
      turnEval: {
        score: parsed.turnEval?.score || "ok",
        comment: parsed.turnEval?.comment || "",
        modelAnswer: parsed.turnEval?.modelAnswer || "",
        variants: parsed.turnEval?.variants || { safe: "", medium: "", bold: "" },
      },
      interlocutorReply: parsed.interlocutorReply || "...",
      isFinalTurn,
      globalDynamic: isFinalTurn && parsed.globalDynamic
        ? {
            feedback: parsed.globalDynamic.feedback || "",
            rating: parsed.globalDynamic.rating || "medium",
            pattern: parsed.globalDynamic.pattern || "",
          }
        : undefined,
    };
  } catch (e) {
    console.error("[AI] Failed to parse dialogue turn response:", content);
    return {
      turnEval: {
        score: "ok",
        comment: "Évaluation indisponible",
        modelAnswer: "",
        variants: { safe: "", medium: "", bold: "" },
      },
      interlocutorReply: "Je vois...",
      isFinalTurn,
    };
  }
}
