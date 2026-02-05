import OpenAI from "openai";
import type { UserProfile, MotherCard, Scenario } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

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
  const prompt = `You are a communication coach helping someone improve their social fluency.

USER PROFILE:
- Tone: ${profile.tonePrimary} (secondary: ${profile.toneSecondary})
- Risk level: ${profile.riskLevel}
- Language: ${profile.language}
- Formality: ${profile.formality} (${profile.tuVous})

FLASHCARD CONTEXT:
Situation: ${card.situation}
Speaker role: ${card.speakerRole}
Other role: ${card.otherRole}
Relationship: ${card.relationship}
Stakes: ${card.stakes}

USER GOAL: ${card.userGoal}

CONSTRAINTS:
${JSON.stringify(card.constraints)}

THINGS TO AVOID:
${card.antiPatterns?.join(", ") || "None specified"}

TARGET VIBE: ${card.targetVibe}

The user wrote: "${userAnswer}"

Generate a model answer that matches the user's profile and constraints. Also generate 3 variants (safe, medium, bold).

Respond in JSON format:
{
  "modelAnswer": "profiled model answer matching user's tone and style",
  "variants": {
    "safe": "very gentle, neutral version",
    "medium": "balanced, slightly playful version",
    "bold": "confident, more daring version"
  },
  "rubric": ["checklist item 1", "checklist item 2", "checklist item 3"]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    return {
      modelAnswer: parsed.modelAnswer || "No model answer generated",
      variants: parsed.variants || { safe: "", medium: "", bold: "" },
      rubric: parsed.rubric || [],
    };
  } catch (e) {
    console.error("Failed to parse AI response for model answer:", e);
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
  const prompt = `You are a communication coach evaluating a user's response.

CONTEXT:
Situation: ${card.situation}
Goal: ${card.userGoal}
Constraints: ${JSON.stringify(card.constraints)}
Anti-patterns to avoid: ${card.antiPatterns?.join(", ") || "None"}

MODEL ANSWER: "${modelAnswer}"
USER ANSWER: "${userAnswer}"

USER PROFILE:
- Tone: ${profile.tonePrimary}
- Risk level: ${profile.riskLevel}
- Language: ${profile.language}

Evaluate if the user's answer:
1. Achieves the goal
2. Follows the constraints
3. Avoids anti-patterns
4. Matches their preferred tone

Respond in JSON:
{
  "pass": true/false,
  "ratingSuggested": "hard" | "medium" | "easy",
  "oneFix": "single most important improvement",
  "redoPrompt": "short instruction for redo (e.g., 'make it shorter', 'add more warmth')",
  "feedback": "brief encouraging feedback"
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 512,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}

export async function generateRoleplayTurn(
  profile: UserProfile,
  scenario: Scenario,
  history: { role: string; content: string }[],
  userMessage: string
): Promise<RoleplayTurnResponse> {
  const turnCount = history.filter((m) => m.role === "user").length + 1;
  const isNearEnd = turnCount >= (scenario.turnsMin || 6);

  const systemPrompt = `You are playing the role of "${scenario.aiName}" in a roleplay scenario.

SCENARIO: ${scenario.title}
CONTEXT: ${scenario.context}
YOUR PERSONA: ${scenario.aiPersona}
YOUR STANCE: ${scenario.aiStance}
BOUNDARIES: ${scenario.aiBoundaries?.join(", ") || "None"}

SCENARIO ARC:
- Phase 1 (opening): ${scenario.phase1}
- Phase 2 (resistance): ${scenario.phase2}
- Phase 3 (resolution): ${scenario.phase3}

Current turn: ${turnCount}
Near end: ${isNearEnd}

USER PROFILE:
- Language: ${profile.language}
- Risk level: ${profile.riskLevel}

RULES:
1. Stay in character as ${scenario.aiName}
2. React naturally to the user's message
3. Follow the scenario arc appropriately
4. Use the user's preferred language (${profile.language})
5. If the scenario should end naturally, set stop=true
6. Keep responses concise (1-3 sentences typically)

Respond in JSON:
{
  "aiMessage": "your in-character response",
  "stop": false,
  "internalThought": "brief coach note about what happened"
}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages,
    response_format: { type: "json_object" },
    max_completion_tokens: 512,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}

export async function generateDebrief(
  profile: UserProfile,
  transcript: { role: string; content: string }[]
): Promise<DebriefResponse> {
  const prompt = `You are a communication coach providing a debrief after a roleplay session.

USER PROFILE:
- Language: ${profile.language}
- Tone preference: ${profile.tonePrimary}
- Risk level: ${profile.riskLevel}

ROLEPLAY TRANSCRIPT:
${transcript.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}

Analyze the user's performance and provide:
1. 2 specific strengths (things they did well)
2. 1 key improvement (single most impactful thing to work on)
3. An optimized rewrite of their weakest response
4. A redo exercise prompt for practice

Score each dimension 0-100:
- Clarity: Was their message clear?
- Frame: Did they maintain their frame/composure?
- Tone: Did they use appropriate tone?
- Concision: Were they appropriately brief?

Respond in ${profile.language === "fr" ? "French" : "English"}.

JSON format:
{
  "strengths": ["strength 1", "strength 2"],
  "improvement": "key improvement area",
  "optimizedRewrite": "better version of their weakest response",
  "redoExercise": "practice prompt for improvement",
  "scores": {
    "clarity": 75,
    "frame": 80,
    "tone": 70,
    "concision": 65
  }
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_completion_tokens: 1024,
  });

  const content = response.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}
