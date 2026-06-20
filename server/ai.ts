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
        maxOutputTokens: 1024,
        // Disable Gemini "thinking" — the latency equivalent of reasoning_effort:"minimal".
        // Without this, gemini-2.5-flash spends several extra seconds reasoning before
        // emitting the small scoring JSON (measured ~7.6s vs ~1.5s).
        thinkingConfig: { thinkingBudget: 0 },
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

// The interlocutor's opening line is already authored inside each card's
// `situation` (the quoted hook, e.g. ...se retourne et dit : "Ce café est bon ?").
// We extract it verbatim instead of asking the model to invent one — the model
// often produced the line the USER was supposed to say, and this is instant
// (no LLM round-trip). Cards with no quoted hook are "à toi de parler" scenes
// where the user speaks first, so we return "" and let the user open.
export function extractInterlocutorOpening(situation: string | null | undefined): string | null {
  if (!situation) return null;
  const s = situation.trim();
  const clean = (t: string) => t.trim();
  // 1. French guillemets « ... »
  let m = s.match(/«\s*([^»]+?)\s*»/);
  if (m && clean(m[1])) return clean(m[1]);
  // 2. Curly double quotes “ ... ”
  m = s.match(/\u201C\s*([^\u201D]+?)\s*\u201D/);
  if (m && clean(m[1])) return clean(m[1]);
  // 3. Straight double quotes " ... " (first span)
  m = s.match(/"([^"]+?)"/);
  if (m && clean(m[1])) return clean(m[1]);
  // 4. Single quotes introduced by a colon. The closing quote is a single-quote
  //    NOT followed by a letter — French elision apostrophes (l'un, n'arrive,
  //    c'est, aujourd'hui) are always followed by a letter, so they're skipped.
  const intro = s.match(/[:：]\s*(['\u2018\u2019])/);
  if (intro && intro.index !== undefined) {
    const rest = s.slice(intro.index + intro[0].length);
    const close = rest.match(/['\u2018\u2019](?![A-Za-zÀ-ÿ])/);
    if (close && close.index !== undefined) {
      const speech = clean(rest.slice(0, close.index));
      if (speech) return speech;
    } else {
      const speech = clean(rest.replace(/['\u2018\u2019]\s*[.!?…]*\s*$/, ""));
      if (speech) return speech;
    }
  }
  return null;
}

export async function generateOpeningLine(
  card: MotherCard,
  _profile: UserProfile | null | undefined
): Promise<string> {
  return extractInterlocutorOpening(card.situation) || "";
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

  // The vocal step only ever uses interlocutorReply (+ globalDynamic on the final
  // turn). The old prompt also generated a full turn evaluation (modelAnswer + 3
  // variants + comment) on EVERY turn that nothing ever read — that's ~250 wasted
  // output tokens per turn and several seconds of latency. We now generate only
  // what the client consumes.
  const jsonSchema = isFinalTurn
    ? `{"interlocutorReply":"...","globalDynamic":{"feedback":"...","rating":"medium","pattern":"..."}}`
    : `{"interlocutorReply":"..."}`;

  const systemPrompt = `Tu es un acteur qui interprète UN personnage réaliste dans une simulation de conversation orale, en français courant/familier.

SITUATION (écrite à la 2e personne : "tu"/"toi" = L'UTILISATEUR qui s'entraîne) :
"${card.situation}"

QUI EST QUI (ne jamais confondre) :
- L'UTILISATEUR est la personne que la situation tutoie ("tu", "toi"). Son rôle : "${card.speakerRole}". C'est LUI qui s'entraîne à répondre.
- TOI, tu incarnes l'AUTRE personne de la scène : "${card.otherRole}". C'est toi qui as lancé la conversation, et tu restes CE personnage du premier au dernier tour.
Relation : ${card.relationship} | Enjeux : ${card.stakes}
Objectif (de l'utilisateur, PAS le tien) : ${card.userGoal}
${lastInterlocutorMsg ? `Ta dernière réplique (toi, ${card.otherRole}) : "${lastInterlocutorMsg}"` : ""}

RÈGLES DE RÔLE (les plus importantes) :
- Tu RÉAGIS, dans la peau de "${card.otherRole}", à ce que l'utilisateur vient de te dire. Garde les mêmes émotions, le même point de vue, les mêmes enjeux que ton personnage.
- Tu n'es PAS un coach et tu n'aides pas l'utilisateur. INTERDIT : lui donner un conseil, l'évaluer, lui dire quoi faire ou quoi dire, lui poser des questions de coaching ("c'est quoi le plus important pour toi ?", "qu'est-ce qui te fait lever le matin ?"), ou lui RENVOYER sa propre question pour le faire réfléchir.
- Si l'utilisateur te pose une question ou te répond, tu réponds EN TANT QUE ton personnage (avec TES doutes, TES émotions, TES intérêts). Tu ne retournes pas la question.
- 1-2 phrases MAXIMUM. Oral, spontané, naturel.
- "interlocutorReply" = UNIQUEMENT les mots que TON personnage dit à voix haute. Jamais un conseil, un indice, une formulation modèle, ni la réplique attendue de l'utilisateur.
${!isFinalTurn ? `- Reste dans l'émotion de ton personnage pour que l'échange continue naturellement (l'utilisateur aura envie/besoin de te répondre). Ne clos pas la scène.` : `- C'est le dernier tour : tu peux conclure naturellement, en restant ton personnage.`}
${isFinalTurn ? `
BILAN FINAL — uniquement pour le champ "globalDynamic" : là, et seulement là, tu redeviens le coach Bagou (direct, tranchant) et tu analyses la performance de L'UTILISATEUR sur tout l'échange (jamais ton personnage) :
- feedback : 1-2 phrases sur la dynamique globale de l'utilisateur.
- rating : "easy" si l'objectif est globalement maîtrisé / "medium" si correct mais perfectible / "hard" si l'objectif est globalement raté.
- pattern : pattern récurrent observé (ex: "tu tends à sur-expliquer", "bonne assertivité globale").
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
    max_completion_tokens: isFinalTurn ? 220 : 90,
  });

  const elapsed = Date.now() - start;
  const content = response.choices[0]?.message?.content || "{}";
  console.log(`[AI] generateDialogueTurnWithEval: ${elapsed}ms`);

  try {
    const parsed = JSON.parse(content);
    return {
      // turnEval is no longer generated (the vocal step never reads it); kept as a
      // stub so the DialogueTurnResult shape and isProposalRewrite path stay valid.
      turnEval: {
        score: "ok",
        comment: "",
        modelAnswer: "",
        variants: { safe: "", medium: "", bold: "" },
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

export interface DashboardAnalysis {
  bilan: string;
  pointsForts: string[];
  pointsFaibles: string[];
  axesAmelioration: string[];
}

export async function generateDashboardAnalysis(
  profile: UserProfile,
  data: {
    totalSessions: number;
    totalCards: number;
    masteredCards: number;
    ratingDist: { hard: number; medium: number; easy: number };
    avgScores: { clarity: number; frame: number; tone: number; concision: number } | null;
    recentStrengths: string[];
    recentImprovements: string[];
    weakTags: string[];
    todayCards: number;
    todaySessions: number;
  }
): Promise<DashboardAnalysis> {
  const scoresLine = data.avgScores
    ? `Scores moyens /100 — clarté ${data.avgScores.clarity}, cadre ${data.avgScores.frame}, ton ${data.avgScores.tone}, concision ${data.avgScores.concision}`
    : "Pas encore de scores de débrief.";

  const prompt = `Tu es le coach Bagou. Analyse la progression GLOBALE de cet utilisateur sur l'ensemble de ses sessions et fais-lui un bilan personnalisé. Style direct, percutant, motivant mais sans complaisance. Tutoie.

Données :
- Activité aujourd'hui : ${data.todayCards} cartes, ${data.todaySessions} session(s).
- Total : ${data.totalSessions} sessions, ${data.totalCards} cartes travaillées, ${data.masteredCards} maîtrisées.
- Auto-évaluations cartes : ${data.ratingDist.hard} difficiles / ${data.ratingDist.medium} moyennes / ${data.ratingDist.easy} maîtrisées.
- ${scoresLine}
- Points forts repérés en débrief : ${data.recentStrengths.slice(0, 8).join(" | ") || "aucun"}
- Axes d'amélioration repérés en débrief : ${data.recentImprovements.slice(0, 6).join(" | ") || "aucun"}
- Tags faibles (cartes ratées) : ${data.weakTags.slice(0, 6).join(", ") || "aucun"}

RÈGLES :
- bilan : 2-3 phrases. Évaluation du jour + tendance générale. Termine par une signature Bagou.
- pointsForts : 3 points forts concrets, 1 phrase chacun, basés sur les données réelles ci-dessus.
- pointsFaibles : 3 points faibles concrets, 1 phrase chacun, francs.
- axesAmelioration : 3 axes ACTIONNABLES (quoi faire concrètement), 1 phrase chacun.
- Si les données sont maigres, reste honnête et pousse à pratiquer davantage.

JSON:
{"bilan":"...","pointsForts":["...","...","..."],"pointsFaibles":["...","...","..."],"axesAmelioration":["...","...","..."]}`;

  const start = Date.now();
  console.log(`[AI] generateDashboardAnalysis: calling ${GPT_MODEL}...`);

  const response = await openai.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: BAGOU_SYSTEM },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: 600,
  });

  console.log(`[AI] generateDashboardAnalysis: ${Date.now() - start}ms`);
  const content = response.choices[0]?.message?.content || "{}";

  try {
    const p = JSON.parse(content);
    return {
      bilan: p.bilan || "",
      pointsForts: Array.isArray(p.pointsForts) ? p.pointsForts : [],
      pointsFaibles: Array.isArray(p.pointsFaibles) ? p.pointsFaibles : [],
      axesAmelioration: Array.isArray(p.axesAmelioration) ? p.axesAmelioration : [],
    };
  } catch (e) {
    console.error("[AI] Failed to parse dashboard analysis:", content);
    return { bilan: "", pointsForts: [], pointsFaibles: [], axesAmelioration: [] };
  }
}
