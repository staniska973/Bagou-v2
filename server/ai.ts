import OpenAI from "openai";
import type { UserProfile, MotherCard, Scenario } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MODEL = "gpt-4o-mini";

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
  const lang = profile.language === "fr" ? "French" : "English";
  const prompt = `Communication coach. Generate a model answer and 3 variants (safe/medium/bold) for this situation.

Profile: tone=${profile.tonePrimary}, risk=${profile.riskLevel}, lang=${lang}, formality=${profile.tuVous}
Situation: ${card.situation}
Goal: ${card.userGoal}
Avoid: ${card.antiPatterns?.join(", ") || "none"}
Vibe: ${card.targetVibe}
User wrote: "${userAnswer}"

Respond in ${lang}. JSON:
{"modelAnswer":"...","variants":{"safe":"...","medium":"...","bold":"..."},"rubric":["check1","check2","check3"]}`;

  const start = Date.now();
  console.log(`[AI] generateModelAnswer: calling ${MODEL}...`);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 800,
  });

  const elapsed = Date.now() - start;
  const content = response.choices[0]?.message?.content || "{}";
  console.log(`[AI] generateModelAnswer: ${elapsed}ms, content length=${content.length}`);

  try {
    const parsed = JSON.parse(content);
    return {
      modelAnswer: parsed.modelAnswer || "No model answer generated",
      variants: parsed.variants || { safe: "", medium: "", bold: "" },
      rubric: parsed.rubric || [],
    };
  } catch (e) {
    console.error("[AI] Failed to parse model answer response:", content);
    return {
      modelAnswer: "Unable to generate model answer",
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
  const lang = profile.language === "fr" ? "French" : "English";
  const prompt = `Communication coach. Evaluate user's answer vs model answer.

Situation: ${card.situation}
Goal: ${card.userGoal}
Avoid: ${card.antiPatterns?.join(", ") || "none"}
Model: "${modelAnswer}"
User: "${userAnswer}"
Profile: tone=${profile.tonePrimary}, risk=${profile.riskLevel}

Respond in ${lang}. JSON:
{"pass":true/false,"ratingSuggested":"hard"|"medium"|"easy","oneFix":"...","redoPrompt":"...","feedback":"..."}`;

  const start = Date.now();
  console.log(`[AI] scoreUserAnswer: calling ${MODEL}...`);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 400,
  });

  const elapsed = Date.now() - start;
  const content = response.choices[0]?.message?.content || "{}";
  console.log(`[AI] scoreUserAnswer: ${elapsed}ms`);

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
      oneFix: "Unable to evaluate",
      redoPrompt: "",
      feedback: "Scoring unavailable",
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

  const systemPrompt = `You are "${scenario.aiName}" in a roleplay. Context: ${scenario.context}
Persona: ${scenario.aiPersona}. Stance: ${scenario.aiStance}.
Arc: open=${scenario.phase1}, resist=${scenario.phase2}, resolve=${scenario.phase3}.
Turn ${turnCount}. ${isNearEnd ? "Near end, wrap up naturally." : ""}
Language: ${profile.language === "fr" ? "French" : "English"}. Keep responses to 1-3 sentences.
JSON: {"aiMessage":"...","stop":false,"internalThought":"..."}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const start = Date.now();
  console.log(`[AI] generateRoleplayTurn: calling ${MODEL}, turn ${turnCount}...`);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    response_format: { type: "json_object" },
    max_completion_tokens: 300,
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
  transcript: { role: string; content: string }[]
): Promise<DebriefResponse> {
  const lang = profile.language === "fr" ? "French" : "English";
  const prompt = `Communication coach debrief. Analyze this roleplay transcript.

Profile: tone=${profile.tonePrimary}, risk=${profile.riskLevel}, lang=${lang}

Transcript:
${transcript.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

Provide 2 strengths, 1 improvement, rewrite of weakest response, redo exercise, and scores (0-100).
Respond in ${lang}. JSON:
{"strengths":["...","..."],"improvement":"...","optimizedRewrite":"...","redoExercise":"...","scores":{"clarity":75,"frame":80,"tone":70,"concision":65}}`;

  const start = Date.now();
  console.log(`[AI] generateDebrief: calling ${MODEL}...`);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 800,
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
