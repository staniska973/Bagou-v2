import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, real, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const languageEnum = ["fr", "en", "es"] as const;
export const modeEnum = ["text", "voice", "mixed"] as const;
export const channelEnum = ["text", "irl", "voice"] as const;
export const toneEnum = ["classy_calm", "fun_teasing", "direct", "warm_empathetic", "minimalist"] as const;
export const riskLevelEnum = ["safe", "medium", "bold"] as const;
export const difficultyEnum = ["n1", "n2", "n3"] as const;
export const ratingEnum = ["hard", "medium", "easy"] as const;
export const themeIdEnum = ["SOCIAL", "PRO", "DAILY", "RELATIONNEL", "DIFFICULT", "STORY", "CULTURE_SOCIALE"] as const;

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  language: text("language").notNull().default("fr"),
  primaryMode: text("primary_mode").notNull().default("text"),
  objectives: text("objectives").array().notNull().default(sql`ARRAY[]::text[]`),
  tonePrimary: text("tone_primary").notNull().default("classy_calm"),
  toneSecondary: text("tone_secondary").notNull().default("warm_empathetic"),
  riskLevel: text("risk_level").notNull().default("safe"),
  easeLevel: text("ease_level").notNull().default("beginner"),
  tuVous: text("tu_vous").notNull().default("tu"),
  formality: text("formality").notNull().default("casual"),
  allowSarcasm: boolean("allow_sarcasm").notNull().default(true),
  allowExplicitFlirt: boolean("allow_explicit_flirt").notNull().default(false),
  allowSwearing: boolean("allow_swearing").notNull().default(false),
  sensitiveTopics: text("sensitive_topics").array().notNull().default(sql`ARRAY[]::text[]`),
  dailySessionMinutes: integer("daily_session_minutes").notNull().default(12),
  calibrationEnabled: boolean("calibration_enabled").notNull().default(false),
  calibrationNotes: text("calibration_notes"),
  streak: integer("streak").notNull().default(0),
  lastSessionDate: text("last_session_date"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const motherCards = pgTable("mother_cards", {
  id: serial("id").primaryKey(),
  cardId: text("card_id").notNull().unique(),
  themeId: text("theme_id").notNull(),
  packId: text("pack_id").notNull(),
  subthemeId: text("subtheme_id").notNull(),
  language: text("language").notNull().default("fr"),
  channel: text("channel").notNull().default("text"),
  difficulty: text("difficulty").notNull().default("n1"),
  intent: text("intent").notNull(),
  situation: text("situation").notNull(),
  speakerRole: text("speaker_role").notNull(),
  otherRole: text("other_role").notNull(),
  relationship: text("relationship").notNull(),
  stakes: text("stakes").notNull(),
  userGoal: text("user_goal").notNull(),
  constraints: jsonb("constraints").notNull().default([]),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  antiPatterns: text("anti_patterns").array().notNull().default(sql`ARRAY[]::text[]`),
  targetVibe: text("target_vibe").notNull(),
  modelAnswerRules: text("model_answer_rules").array().notNull().default(sql`ARRAY[]::text[]`),
  variantRulesSafe: text("variant_rules_safe").array().notNull().default(sql`ARRAY[]::text[]`),
  variantRulesMedium: text("variant_rules_medium").array().notNull().default(sql`ARRAY[]::text[]`),
  variantRulesBold: text("variant_rules_bold").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const srsStates = pgTable("srs_states", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  cardId: text("card_id").notNull(),
  dueDate: text("due_date").notNull(),
  intervalDays: integer("interval_days").notNull().default(1),
  ease: real("ease").notNull().default(2.5),
  reps: integer("reps").notNull().default(0),
  lapses: integer("lapses").notNull().default(0),
  lastRating: text("last_rating"),
  isPriority: boolean("is_priority").notNull().default(false),
  needsRoleplay: boolean("needs_roleplay").notNull().default(false),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const scenarios = pgTable("scenarios", {
  id: serial("id").primaryKey(),
  scenarioId: text("scenario_id").notNull().unique(),
  themeId: text("theme_id").notNull(),
  packId: text("pack_id").notNull(),
  subthemeId: text("subtheme_id").notNull(),
  language: text("language").notNull().default("fr"),
  primaryChannel: text("primary_channel").notNull().default("text"),
  title: text("title").notNull(),
  context: text("context").notNull(),
  objective: text("objective").notNull(),
  constraints: text("constraints").array().notNull().default(sql`ARRAY[]::text[]`),
  startingMessage: text("starting_message").notNull(),
  aiName: text("ai_name").notNull(),
  aiPersona: text("ai_persona").notNull(),
  aiStance: text("ai_stance").notNull(),
  aiBoundaries: text("ai_boundaries").array().notNull().default(sql`ARRAY[]::text[]`),
  userName: text("user_name").notNull(),
  userFrame: text("user_frame").notNull(),
  targetSkills: text("target_skills").array().notNull().default(sql`ARRAY[]::text[]`),
  difficulty: text("difficulty").notNull().default("n1"),
  durationSecondsTarget: integer("duration_seconds_target").notNull().default(300),
  turnsMin: integer("turns_min").notNull().default(6),
  turnsMax: integer("turns_max").notNull().default(10),
  phase1: text("phase1").notNull(),
  phase2: text("phase2").notNull(),
  phase3: text("phase3").notNull(),
  successEndings: text("success_endings").array().notNull().default(sql`ARRAY[]::text[]`),
  failureEndings: text("failure_endings").array().notNull().default(sql`ARRAY[]::text[]`),
  linkedCardIds: text("linked_card_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const trainingSessions = pgTable("training_sessions", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id").notNull().references(() => userProfiles.id, { onDelete: "cascade" }),
  sessionDate: text("session_date").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  flashcardsCompleted: integer("flashcards_completed").notNull().default(0),
  roleplayCompleted: boolean("roleplay_completed").notNull().default(false),
  debriefCompleted: boolean("debrief_completed").notNull().default(false),
  scenarioId: text("scenario_id"),
  phase: text("phase").notNull().default("flashcards"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const sessionEvents = pgTable("session_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => trainingSessions.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  cardId: text("card_id"),
  userAnswer: text("user_answer"),
  modelAnswer: text("model_answer"),
  variants: jsonb("variants"),
  rating: text("rating"),
  feedback: text("feedback"),
  redoPrompt: text("redo_prompt"),
  redoAnswer: text("redo_answer"),
  roleplayTurn: integer("roleplay_turn"),
  roleplayRole: text("roleplay_role"),
  roleplayContent: text("roleplay_content"),
  debriefStrengths: text("debrief_strengths").array(),
  debriefImprovement: text("debrief_improvement"),
  debriefRewrite: text("debrief_rewrite"),
  debriefRedoExercise: text("debrief_redo_exercise"),
  scores: jsonb("scores"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({
  id: true,
  createdAt: true,
});

export const insertMotherCardSchema = createInsertSchema(motherCards).omit({
  id: true,
  createdAt: true,
});

export const insertSrsStateSchema = createInsertSchema(srsStates).omit({
  id: true,
  updatedAt: true,
});

export const insertScenarioSchema = createInsertSchema(scenarios).omit({
  id: true,
  createdAt: true,
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessions).omit({
  id: true,
  createdAt: true,
});

export const insertSessionEventSchema = createInsertSchema(sessionEvents).omit({
  id: true,
  createdAt: true,
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

export type MotherCard = typeof motherCards.$inferSelect;
export type InsertMotherCard = z.infer<typeof insertMotherCardSchema>;

export type SrsState = typeof srsStates.$inferSelect;
export type InsertSrsState = z.infer<typeof insertSrsStateSchema>;

export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = z.infer<typeof insertScenarioSchema>;

export type TrainingSession = typeof trainingSessions.$inferSelect;
export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;

export type SessionEvent = typeof sessionEvents.$inferSelect;
export type InsertSessionEvent = z.infer<typeof insertSessionEventSchema>;

export { conversations, messages } from "./models/chat";
export type { Conversation, Message, InsertConversation, InsertMessage } from "./models/chat";

export * from "./models/auth";
