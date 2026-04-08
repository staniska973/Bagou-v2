import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { generateModelAnswer, scoreUserAnswer, generateRoleplayTurn, generateDebrief, generateDialogueTurnWithEval, updateAIRuntimeConfig, getAIRuntimeConfig } from "./ai";
import { speechToText, ensureCompatibleFormat } from "./replit_integrations/audio/client";
import { insertUserProfileSchema, insertSessionEventSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "./replit_integrations/auth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function calculateNextReview(
  currentInterval: number,
  ease: number,
  rating: "hard" | "medium" | "easy",
  lapses: number,
  reps: number
): { interval: number; ease: number; lapses: number; reps: number } {
  let newInterval = currentInterval;
  let newEase = ease;
  let newLapses = lapses;
  let newReps = reps;

  if (rating === "hard") {
    newLapses++;
    newReps = 0;
    newInterval = 1;
    newEase = Math.max(1.3, ease - 0.2);
  } else if (rating === "medium") {
    newReps++;
    if (newReps === 1) {
      newInterval = 1;
    } else if (newReps === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(currentInterval * ease);
    }
    newEase = Math.max(1.3, ease - 0.15);
  } else {
    newReps++;
    if (newReps === 1) {
      newInterval = 1;
    } else if (newReps === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(currentInterval * ease);
    }
    newEase = ease + 0.15;
  }

  return {
    interval: Math.min(newInterval, 365),
    ease: newEase,
    lapses: newLapses,
    reps: newReps,
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

export async function registerRoutes(server: Server, app: Express): Promise<void> {
  storage.getAllAdminSettings().then((settings) => {
    updateAIRuntimeConfig({
      scoringProvider: (settings.scoring_model || "gemini") as "gpt" | "gemini",
      generationProvider: (settings.generation_model || "gpt") as "gpt" | "gemini",
      bagouSystemExtra: settings.bagou_system_extra || "",
      dialogueTurns: parseInt(settings.dialogue_turns || "3"),
    });
  }).catch(() => {});

  app.get("/api/profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const profile = await storage.getProfile(id);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.get("/api/profiles/user/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const authUserId = req.user?.claims?.sub;
      if (authUserId !== req.params.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const profile = await storage.getProfileByUserId(req.params.userId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile by userId:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.post("/api/profiles", async (req, res) => {
    try {
      const data = insertUserProfileSchema.parse(req.body);
      const profile = await storage.createProfile(data);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating profile:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid profile data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create profile" });
    }
  });

  app.patch("/api/profiles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const profile = await storage.updateProfile(id, req.body);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.get("/api/flashcards/due/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const themeId = req.query.themeId as string | undefined;
      const subthemeId = req.query.subthemeId as string | undefined;
      const mode = req.query.mode as string | undefined;
      const today = new Date().toISOString().split("T")[0];

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      if (mode === "review") {
        const weakStates = await storage.getWeakCards(profileId);
        const results = [];
        for (const state of weakStates) {
          if (results.length >= 15) break;
          const card = await storage.getMotherCard(state.cardId);
          if (card && card.language === profile.language) {
            results.push({ card, srsState: state });
          }
        }
        return res.json(results);
      }

      const dueStates = await storage.getDueCards(profileId, today);

      let filteredDueStates = dueStates;
      if (themeId || subthemeId) {
        const cardIds = dueStates.map(s => s.cardId);
        const dueCards = [];
        for (const cid of cardIds) {
          const c = await storage.getMotherCard(cid);
          if (c) dueCards.push(c);
        }
        const filtered = dueCards.filter(c => {
          if (themeId && c.themeId !== themeId) return false;
          if (subthemeId && c.subthemeId !== subthemeId) return false;
          return true;
        });
        const filteredIds = new Set(filtered.map(c => c.cardId));
        filteredDueStates = dueStates.filter(s => filteredIds.has(s.cardId));
      }

      if (filteredDueStates.length === 0) {
        let allCards;
        if (themeId && subthemeId) {
          allCards = await storage.getMotherCardsBySubtheme(themeId, subthemeId, profile.language);
        } else if (themeId) {
          allCards = await storage.getMotherCardsByTheme(themeId, profile.language);
        } else {
          allCards = await storage.getAllMotherCards(profile.language);
        }
        const existingStates = await storage.getAllSrsStates(profileId);
        const existingCardIds = new Set(existingStates.map(s => s.cardId));
        const newCards = allCards.filter(c => !existingCardIds.has(c.cardId));
        const cardsToReview = newCards.slice(0, 10);

        const results = [];
        for (const card of cardsToReview) {
          const srsState = await storage.getOrCreateSrsState(profileId, card.cardId);
          results.push({ card, srsState });
        }
        return res.json(results);
      }

      const results = [];
      for (const state of filteredDueStates.slice(0, 15)) {
        const card = await storage.getMotherCard(state.cardId);
        if (card) {
          results.push({ card, srsState: state });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Error fetching due cards:", error);
      res.status(500).json({ error: "Failed to fetch due cards" });
    }
  });

  app.post("/api/flashcards/generate-answer", async (req, res) => {
    try {
      const { profileId, cardId, userAnswer } = req.body;

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const card = await storage.getMotherCard(cardId);
      if (!card) {
        return res.status(404).json({ error: "Card not found" });
      }

      const [result, scoring] = await Promise.all([
        generateModelAnswer(profile, card, userAnswer),
        scoreUserAnswer(profile, card, userAnswer, ""),
      ]);

      const finalScoring = await scoreUserAnswer(profile, card, userAnswer, result.modelAnswer);

      res.json({
        modelAnswer: result.modelAnswer,
        variants: result.variants,
        rubric: result.rubric,
        feedback: finalScoring,
      });
    } catch (error) {
      console.error("Error generating model answer:", error);
      res.status(500).json({ error: "Failed to generate model answer" });
    }
  });

  app.post("/api/flashcards/rate", async (req, res) => {
    try {
      const { profileId, sessionId, cardId, rating, userAnswer } = req.body;

      const srsState = await storage.getOrCreateSrsState(profileId, cardId);
      const today = new Date().toISOString().split("T")[0];

      const { interval, ease, lapses, reps } = calculateNextReview(
        srsState.intervalDays,
        srsState.ease,
        rating,
        srsState.lapses,
        srsState.reps
      );

      const newDueDate = addDays(today, interval);

      await storage.updateSrsState(srsState.id, {
        intervalDays: interval,
        ease,
        lapses,
        reps,
        dueDate: newDueDate,
        lastRating: rating,
        needsRoleplay: rating === "hard",
      });

      if (sessionId) {
        await storage.createSessionEvent({
          sessionId,
          eventType: "flashcard_attempt",
          cardId,
          userAnswer,
          rating,
        });
      }

      res.json({ success: true, newDueDate, interval });
    } catch (error) {
      console.error("Error rating card:", error);
      res.status(500).json({ error: "Failed to rate card" });
    }
  });

  app.get("/api/scenarios", async (req, res) => {
    try {
      const language = (req.query.language as string) || "fr";
      const allScenarios = await storage.getAllScenarios(language);
      res.json(allScenarios);
    } catch (error) {
      console.error("Error fetching scenarios:", error);
      res.status(500).json({ error: "Failed to fetch scenarios" });
    }
  });

  app.get("/api/scenarios/random/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const hardCards = await storage.getDueCards(profileId, new Date().toISOString().split("T")[0]);
      const linkedCardIds = hardCards.filter(s => s.needsRoleplay).map(s => s.cardId);

      const scenario = await storage.getRandomScenario(profile.language, linkedCardIds);

      if (!scenario) {
        return res.status(404).json({ error: "No scenarios available" });
      }

      res.json(scenario);
    } catch (error) {
      console.error("Error fetching random scenario:", error);
      res.status(500).json({ error: "Failed to fetch scenario" });
    }
  });

  app.post("/api/roleplay/message", async (req, res) => {
    try {
      const { profileId, sessionId, scenarioId, history, userMessage } = req.body;

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const scenario = await storage.getScenario(scenarioId);
      if (!scenario) {
        return res.status(404).json({ error: "Scenario not found" });
      }

      const result = await generateRoleplayTurn(profile, scenario, history, userMessage);

      if (sessionId) {
        await storage.createSessionEvent({
          sessionId,
          eventType: "roleplay_turn",
          roleplayTurn: history.length,
          roleplayRole: "user",
          roleplayContent: userMessage,
        });

        await storage.createSessionEvent({
          sessionId,
          eventType: "roleplay_turn",
          roleplayTurn: history.length + 1,
          roleplayRole: "assistant",
          roleplayContent: result.aiMessage,
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error generating roleplay turn:", error);
      res.status(500).json({ error: "Failed to generate roleplay turn" });
    }
  });

  app.post("/api/debrief/generate", async (req, res) => {
    try {
      const { profileId, sessionId, transcript } = req.body;

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const result = await generateDebrief(profile, transcript);

      if (sessionId) {
        await storage.createSessionEvent({
          sessionId,
          eventType: "debrief",
          debriefStrengths: result.strengths,
          debriefImprovement: result.improvement,
          debriefRewrite: result.optimizedRewrite,
          debriefRedoExercise: result.redoExercise,
          scores: result.scores,
        });

        await storage.updateSession(sessionId, {
          debriefCompleted: true,
          completedAt: new Date(),
        });
      }

      res.json(result);
    } catch (error) {
      console.error("Error generating debrief:", error);
      res.status(500).json({ error: "Failed to generate debrief" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const { profileId } = req.body;
      const today = new Date().toISOString().split("T")[0];

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const session = await storage.createSession({
        profileId,
        sessionDate: today,
        phase: "flashcards",
      });

      const isNewDay = profile.lastSessionDate !== today;
      if (isNewDay) {
        const yesterday = addDays(today, -1);
        const isConsecutive = profile.lastSessionDate === yesterday;
        await storage.updateProfile(profileId, {
          streak: isConsecutive ? profile.streak + 1 : 1,
          lastSessionDate: today,
        });
      }

      res.status(201).json(session);
    } catch (error) {
      console.error("Error creating session:", error);
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = await storage.updateSession(id, req.body);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      console.error("Error updating session:", error);
      res.status(500).json({ error: "Failed to update session" });
    }
  });

  app.get("/api/stats/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const stats = await storage.getStats(profileId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/mother-cards", async (req, res) => {
    try {
      const language = (req.query.language as string) || "fr";
      const themeId = req.query.themeId as string;
      const subthemeId = req.query.subthemeId as string;

      let cards;
      if (themeId && subthemeId) {
        cards = await storage.getMotherCardsBySubtheme(themeId, subthemeId, language);
      } else if (themeId) {
        cards = await storage.getMotherCardsByTheme(themeId, language);
      } else {
        cards = await storage.getAllMotherCards(language);
      }
      res.json(cards);
    } catch (error) {
      console.error("Error fetching mother cards:", error);
      res.status(500).json({ error: "Failed to fetch mother cards" });
    }
  });

  app.get("/api/mother-cards/count", async (req, res) => {
    try {
      const count = await storage.getMotherCardCount();
      res.json({ count });
    } catch (error) {
      console.error("Error counting mother cards:", error);
      res.status(500).json({ error: "Failed to count cards" });
    }
  });

  app.post("/api/seed", async (req, res) => {
    try {
      await seedDatabase();
      res.json({ success: true, message: "Database seeded successfully" });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ error: "Failed to seed database" });
    }
  });

  app.post("/api/seed-cards", async (req, res) => {
    try {
      const { generateAllCards } = await import("./seed-cards");
      res.json({ started: true, message: "Card generation started in background" });
      generateAllCards(storage, (progress) => {
        console.log(`[seed] ${progress.completedSubthemes}/${progress.totalSubthemes} subthemes | ${progress.currentTheme}/${progress.currentSubtheme} | ${progress.totalCardsGenerated} cards`);
      }).then(result => {
        console.log(`[seed] COMPLETE: ${result.totalCardsGenerated} cards generated, ${result.skippedSubthemes} skipped, ${result.errors.length} errors`);
      }).catch(err => console.error("[seed] ERROR:", err));
    } catch (error) {
      console.error("Error starting card generation:", error);
      res.status(500).json({ error: "Failed to start card generation" });
    }
  });

  app.post("/api/admin/generate-cards", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { generateAllCards, THEMES_CONFIG } = await import("./seed-cards");

      res.json({ started: true, message: "Card generation started", themes: THEMES_CONFIG.map(t => ({ id: t.id, label: t.label, subthemes: t.subthemes.length })) });

      generateAllCards(storage, (progress) => {
        console.log(`[seed] ${progress.currentTheme}/${progress.currentSubtheme}: ${progress.totalCardsGenerated} generated, ${progress.completedSubthemes}/${progress.totalSubthemes} subthemes`);
      }).catch(err => console.error("Card generation error:", err));
    } catch (error) {
      console.error("Error starting card generation:", error);
      res.status(500).json({ error: "Failed to start card generation" });
    }
  });

  app.post("/api/admin/generate-subtheme", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { themeId, subthemeId, forceRegenerate } = req.body;
      const { generateSubthemeCards } = await import("./seed-cards");

      const result = await generateSubthemeCards(storage, themeId, subthemeId, forceRegenerate);
      res.json({ success: true, cardsGenerated: result.generated, skipped: result.skipped });
    } catch (error) {
      console.error("Error generating subtheme cards:", error);
      res.status(500).json({ error: "Failed to generate cards" });
    }
  });

  app.get("/api/themes", async (req, res) => {
    try {
      const { THEMES_CONFIG } = await import("./seed-cards");
      res.json(THEMES_CONFIG.map(t => ({
        id: t.id,
        label: t.label,
        subthemes: t.subthemes.map(s => ({ id: s.id, label: s.label })),
      })));
    } catch (error) {
      console.error("Error fetching themes:", error);
      res.status(500).json({ error: "Failed to fetch themes" });
    }
  });

  app.get("/api/admin/themes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { THEMES_CONFIG } = await import("./seed-cards");
      res.json(THEMES_CONFIG);
    } catch (error) {
      console.error("Error fetching themes:", error);
      res.status(500).json({ error: "Failed to fetch themes" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const allUsers = await dbModule.select().from(users);
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/admin", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { isAdmin } = req.body;
      const [updated] = await dbModule.update(users).set({ isAdmin }).where(eq(users.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/cards/:cardId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      await storage.deleteMotherCard(req.params.cardId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting card:", error);
      res.status(500).json({ error: "Failed to delete card" });
    }
  });

  app.patch("/api/admin/cards/:cardId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const card = await storage.updateMotherCard(req.params.cardId, req.body);
      if (!card) {
        return res.status(404).json({ error: "Card not found" });
      }
      res.json(card);
    } catch (error) {
      console.error("Error updating card:", error);
      res.status(500).json({ error: "Failed to update card" });
    }
  });

  app.get("/api/admin/settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const settings = await storage.getAllAdminSettings();
      const current = getAIRuntimeConfig();
      res.json({
        scoring_model: settings.scoring_model || current.scoringProvider,
        generation_model: settings.generation_model || current.generationProvider,
        bagou_system_extra: settings.bagou_system_extra || "",
        dialogue_turns: parseInt(settings.dialogue_turns || "3"),
      });
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { scoring_model, generation_model, bagou_system_extra, dialogue_turns } = req.body;

      if (scoring_model) await storage.setAdminSetting("scoring_model", scoring_model);
      if (generation_model) await storage.setAdminSetting("generation_model", generation_model);
      if (bagou_system_extra !== undefined) await storage.setAdminSetting("bagou_system_extra", bagou_system_extra);
      if (dialogue_turns !== undefined) await storage.setAdminSetting("dialogue_turns", String(dialogue_turns));

      updateAIRuntimeConfig({
        scoringProvider: (scoring_model || getAIRuntimeConfig().scoringProvider) as "gpt" | "gemini",
        generationProvider: (generation_model || getAIRuntimeConfig().generationProvider) as "gpt" | "gemini",
        bagouSystemExtra: bagou_system_extra !== undefined ? bagou_system_extra : getAIRuntimeConfig().bagouSystemExtra,
        dialogueTurns: dialogue_turns !== undefined ? parseInt(dialogue_turns) : getAIRuntimeConfig().dialogueTurns,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating admin settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.patch("/api/admin/users/:id/subscription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [user] = await dbModule.select().from(users).where(eq(users.id, userId));
      if (!user?.isAdmin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { subscriptionStatus, subscriptionExpiresAt } = req.body;
      const updateData: any = {};
      if (subscriptionStatus) updateData.subscriptionStatus = subscriptionStatus;
      if (subscriptionExpiresAt !== undefined) updateData.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;

      const [updated] = await dbModule.update(users).set(updateData).where(eq(users.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating subscription:", error);
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  app.post("/api/session/dialogue-turn", async (req, res) => {
    try {
      const { profileId, cardId, history, userMessage, turnNumber } = req.body;

      if (!profileId || !cardId || !userMessage) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const card = await storage.getMotherCard(cardId);
      if (!card) {
        return res.status(404).json({ error: "Card not found" });
      }

      const settings = await storage.getAllAdminSettings();
      const maxTurns = parseInt(settings.dialogue_turns || "3");

      const result = await generateDialogueTurnWithEval(
        profile,
        card,
        history || [],
        userMessage,
        turnNumber || 1,
        maxTurns
      );

      res.json({ ...result, maxTurns });
    } catch (error) {
      console.error("Error generating dialogue turn:", error);
      res.status(500).json({ error: "Failed to generate dialogue turn" });
    }
  });

  app.post("/api/transcribe", upload.single("audio"), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const rawBuffer = Buffer.from(req.file.buffer);
      const { buffer: audioBuffer, format } = await ensureCompatibleFormat(rawBuffer);
      const text = await speechToText(audioBuffer, format);

      res.json({ text });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });
}

async function seedDatabase() {
  const existingCards = await storage.getAllMotherCards("fr");
  if (existingCards.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  const motherCardsData = [
    {
      cardId: "FC_SOCIAL_001",
      themeId: "SOCIAL",
      packId: "PACK_SOCIAL_1",
      subthemeId: "small_talk",
      language: "fr",
      channel: "irl",
      difficulty: "n1",
      intent: "start_conversation",
      situation: "Tu es a une soiree d'anniversaire. Tu vois quelqu'un que tu ne connais pas assis seul sur le canape. Comment tu engages la conversation ?",
      speakerRole: "invite",
      otherRole: "invite inconnu",
      relationship: "strangers",
      stakes: "low",
      userGoal: "Engager une conversation legere et naturelle avec un inconnu",
      constraints: ["Pas de question fermee", "Eviter les sujets trop personnels", "Rester leger et observationnel"],
      tags: ["ice_breaker", "party", "small_talk"],
      antiPatterns: ["Poser une question trop intime", "Parler uniquement de soi", "Etre trop direct"],
      targetVibe: "Detendu, curieux, accessible",
      modelAnswerRules: ["Observation + question ouverte", "Touche d'humour legere", "Laisser de l'espace pour la reponse"],
      variantRulesSafe: ["Classique et poli", "Question simple sur l'evenement"],
      variantRulesMedium: ["Un peu de personnalite", "Observation originale"],
      variantRulesBold: ["Humour assume", "Approche decalee mais respectueuse"],
    },
    {
      cardId: "FC_SOCIAL_002",
      themeId: "SOCIAL",
      packId: "PACK_SOCIAL_1",
      subthemeId: "compliments",
      language: "fr",
      channel: "irl",
      difficulty: "n1",
      intent: "give_compliment",
      situation: "Un ami te montre un nouveau projet creatif sur lequel il a travaille. Comment tu lui fais un compliment authentique ?",
      speakerRole: "ami",
      otherRole: "ami createur",
      relationship: "friends",
      stakes: "low",
      userGoal: "Faire un compliment sincere qui valorise l'effort et le resultat",
      constraints: ["Etre specifique", "Eviter les formules creuses", "Montrer que tu as vraiment regarde"],
      tags: ["compliment", "friendship", "encouragement"],
      antiPatterns: ["'C'est cool' sans precision", "Comparer a quelque chose de negatif", "Changer de sujet trop vite"],
      targetVibe: "Chaleureux, sincere, enthousiaste",
      modelAnswerRules: ["Mentionner un detail specifique", "Exprimer une emotion", "Poser une question sur le processus"],
      variantRulesSafe: ["Compliment classique et sincere"],
      variantRulesMedium: ["Ajout d'enthousiasme visible"],
      variantRulesBold: ["Expression d'admiration franche"],
    },
    {
      cardId: "FC_PRO_001",
      themeId: "PRO",
      packId: "PACK_PRO_1",
      subthemeId: "assertiveness",
      language: "fr",
      channel: "irl",
      difficulty: "n2",
      intent: "decline_request",
      situation: "Ton manager te demande de rester tard ce soir pour finir un projet, mais tu as un engagement personnel important. Comment tu refuses poliment ?",
      speakerRole: "employe",
      otherRole: "manager",
      relationship: "professional_hierarchy",
      stakes: "medium",
      userGoal: "Refuser la demande tout en maintenant une bonne relation professionnelle",
      constraints: ["Etre ferme mais respectueux", "Proposer une alternative", "Ne pas trop se justifier"],
      tags: ["assertiveness", "work_life_balance", "boundary"],
      antiPatterns: ["S'excuser excessivement", "Mentir sur la raison", "Accepter a contrecoeur"],
      targetVibe: "Professionnel, calme, assertif",
      modelAnswerRules: ["Exprimer la limite clairement", "Proposer une solution", "Rester concis"],
      variantRulesSafe: ["Diplomatique avec excuse legere"],
      variantRulesMedium: ["Direct mais proposant une alternative"],
      variantRulesBold: ["Tres direct, pas d'excuse"],
    },
    {
      cardId: "FC_DAILY_001",
      themeId: "DAILY",
      packId: "PACK_DAILY_1",
      subthemeId: "complaints",
      language: "fr",
      channel: "irl",
      difficulty: "n2",
      intent: "make_complaint",
      situation: "Tu recois ton plat au restaurant et il est froid. Comment tu fais remarquer le probleme au serveur ?",
      speakerRole: "client",
      otherRole: "serveur",
      relationship: "service",
      stakes: "low",
      userGoal: "Obtenir un plat chaud sans creer de tension",
      constraints: ["Rester poli", "Etre factuel", "Donner une chance de corriger"],
      tags: ["complaint", "restaurant", "service"],
      antiPatterns: ["Etre passif-agressif", "S'emporter", "Ignorer le probleme"],
      targetVibe: "Calme, factuel, assertif",
      modelAnswerRules: ["Constater le fait", "Demander poliment", "Remercier la prise en charge"],
      variantRulesSafe: ["Tres poli avec beaucoup de precaution"],
      variantRulesMedium: ["Direct mais aimable"],
      variantRulesBold: ["Factuel et confiant"],
    },
    {
      cardId: "FC_RELATIONNEL_001",
      themeId: "RELATIONNEL",
      packId: "PACK_RELATIONNEL_1",
      subthemeId: "flirting",
      language: "fr",
      channel: "text",
      difficulty: "n2",
      intent: "tease_playfully",
      situation: "Tu discutes avec quelqu'un qui te plait sur une app de rencontre. La personne dit qu'elle adore les films d'horreur. Comment tu rebondis de maniere taquine ?",
      speakerRole: "utilisateur",
      otherRole: "match",
      relationship: "potential_romantic",
      stakes: "low",
      userGoal: "Creer du jeu et de la legerete dans la conversation",
      constraints: ["Rester leger", "Ne pas etre mechant", "Montrer de l'interet"],
      tags: ["flirting", "dating", "teasing"],
      antiPatterns: ["Etre condescendant", "Trop d'accord sur tout", "Reponse plate"],
      targetVibe: "Joueur, leger, charmeur",
      modelAnswerRules: ["Taquinerie gentille", "Question ou challenge ludique", "Montrer sa personnalite"],
      variantRulesSafe: ["Interet sincere avec legere taquinerie"],
      variantRulesMedium: ["Taquinerie assumee avec question maligne"],
      variantRulesBold: ["Challenge ludique plus prononce"],
    },
  ];

  await storage.createMotherCards(motherCardsData);

  const scenariosData = [
    {
      scenarioId: "SC_SOCIAL_001",
      themeId: "SOCIAL",
      packId: "PACK_SOCIAL_1",
      subthemeId: "party_conversation",
      language: "fr",
      primaryChannel: "irl",
      title: "La soiree entre amis d'amis",
      context: "Tu es a une soiree organisee par ton ami Marc. Il y a beaucoup de gens que tu ne connais pas. Julie, une amie de Marc, vient vers toi.",
      objective: "Avoir une conversation fluide et agreable avec Julie, faire bonne impression",
      constraints: ["Rester authentique", "Trouver des points communs", "Ne pas monopoliser la parole"],
      startingMessage: "Hey ! Tu dois etre un ami de Marc, non ? Moi c'est Julie. Tu connais beaucoup de monde ici ?",
      aiName: "Julie",
      aiPersona: "Jeune femme sociable, curieuse, travaille dans l'evenementiel. Aime les conversations legeres mais apprecie aussi la profondeur.",
      aiStance: "Ouverte et accueillante, pose des questions, reagit positivement",
      aiBoundaries: ["Ne devient pas trop personnelle trop vite", "Reste polie meme si mal a l'aise"],
      userName: "Toi",
      userFrame: "Nouveau a la soiree, cherche a socialiser naturellement",
      targetSkills: ["small_talk", "listening", "building_rapport"],
      difficulty: "n1",
      durationSecondsTarget: 180,
      turnsMin: 6,
      turnsMax: 10,
      phase1: "Introduction et decouverte mutuelle",
      phase2: "Approfondissement des points communs",
      phase3: "Cloture naturelle ou echange de contacts",
      successEndings: ["Echange de numero", "Proposition de se revoir", "Conversation memorable"],
      failureEndings: ["Malaise palpable", "Conversation qui meurt", "Fuite polie"],
      linkedCardIds: ["FC_SOCIAL_001", "FC_SOCIAL_002"],
    },
    {
      scenarioId: "SC_PRO_001",
      themeId: "PRO",
      packId: "PACK_PRO_1",
      subthemeId: "negotiation",
      language: "fr",
      primaryChannel: "irl",
      title: "La demande d'augmentation",
      context: "Tu travailles dans cette entreprise depuis 2 ans. Tu as obtenu de bons resultats et tu estimes meriter une augmentation. Tu as rdv avec ton manager.",
      objective: "Obtenir une augmentation ou au moins ouvrir une negociation serieuse",
      constraints: ["Rester professionnel", "Argumenter avec des faits", "Gerer les objections"],
      startingMessage: "Ah, assieds-toi. Alors, tu voulais me voir ? De quoi s'agit-il ?",
      aiName: "Antoine",
      aiPersona: "Manager de 45 ans, pragmatique, apprecie les employes mais doit gerer les budgets. Juste mais ferme.",
      aiStance: "Ecoute, pose des questions, presente des objections raisonnables",
      aiBoundaries: ["Ne s'enerve pas", "Reste professionnel", "Peut dire non mais explique"],
      userName: "Toi",
      userFrame: "Employe motive qui veut etre reconnu a sa juste valeur",
      targetSkills: ["assertiveness", "negotiation", "handling_objections"],
      difficulty: "n2",
      durationSecondsTarget: 240,
      turnsMin: 8,
      turnsMax: 12,
      phase1: "Presentation de la demande",
      phase2: "Gestion des objections",
      phase3: "Negociation et accord",
      successEndings: ["Augmentation accordee", "Plan d'action defini", "Discussion constructive"],
      failureEndings: ["Refus sec", "Malaise relationnel", "Arguments non entendus"],
      linkedCardIds: ["FC_PRO_001"],
    },
  ];

  for (const scenarioData of scenariosData) {
    await storage.createScenario(scenarioData);
  }

  console.log("Database seeded with sample data");
}
