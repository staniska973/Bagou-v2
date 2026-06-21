import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { generateModelAnswer, scoreUserAnswer, generateRoleplayTurn, generateDebrief, generateDialogueTurnWithEval, generateScenePersona, generateDashboardAnalysis, updateAIRuntimeConfig, getAIRuntimeConfig, type DashboardAnalysis, type ScenePersona } from "./ai";
import { speechToText, ensureCompatibleFormat, textToSpeech } from "./replit_integrations/audio/client";
import { insertUserProfileSchema, insertSessionEventSchema, interlocutorGenderEnum } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "./replit_integrations/auth";
import { quotaGuard } from "./subscription";
import { startVocalSession, claimVocalTurn, closeVocalSession } from "./vocalSession";
import { listClients, getClientDetail, getKpis } from "./adminAnalytics";

declare module "express-session" {
  interface SessionData {
    adminLoggedIn?: boolean;
  }
}

function isAdminSession(req: any, res: any, next: any) {
  if (req.session?.adminLoggedIn === true) return next();
  return res.status(401).json({ error: "Admin authentication required" });
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const genderSchema = z.enum(interlocutorGenderEnum);

const dashboardAnalysisCache = new Map<string, { sig: string; data: DashboardAnalysis }>();

// Server-side, in-memory store for the per-session interlocutor persona. The
// persona's objective/tactics are HIDDEN from the user and must never reach the
// client, and must never be accepted FROM the client (prompt-injection risk).
// It is generated once at conversation start and looked up server-side on every
// dialogue turn. Keyed by profile+card+gender, with a TTL; regenerated on miss.
const PERSONA_TTL_MS = 60 * 60 * 1000;
const personaCache = new Map<string, { persona: ScenePersona; expires: number }>();
function personaKey(
  profileId: number | string,
  cardId: number | string,
  gender: string = "femme"
): string {
  return `${profileId}:${cardId}:${gender}`;
}
function setPersona(key: string, persona: ScenePersona): void {
  const now = Date.now();
  if (personaCache.size > 500) {
    personaCache.forEach((v, k) => {
      if (v.expires < now) personaCache.delete(k);
    });
  }
  personaCache.set(key, { persona, expires: now + PERSONA_TTL_MS });
}
function getPersona(key: string): ScenePersona | null {
  const entry = personaCache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    personaCache.delete(key);
    return null;
  }
  return entry.persona;
}

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

  app.get("/api/profiles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const profile = await storage.getProfile(id);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      // Only the owner may read a profile by id (prevents enumeration by id).
      const authUserId = req.user?.claims?.sub;
      if (!profile.userId || profile.userId !== authUserId) {
        return res.status(403).json({ error: "Access denied" });
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

  app.post("/api/profiles", isAuthenticated, async (req: any, res) => {
    try {
      // Force the owner to the authenticated user; never trust a body userId,
      // so a caller can't create a profile for someone else.
      const authUserId = req.user?.claims?.sub;
      const data = insertUserProfileSchema.parse({ ...req.body, userId: authUserId });
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

  app.patch("/api/profiles/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getProfile(id);
      if (!existing) {
        return res.status(404).json({ error: "Profile not found" });
      }
      const authUserId = req.user?.claims?.sub;
      if (!existing.userId || existing.userId !== authUserId) {
        return res.status(403).json({ error: "Access denied" });
      }
      // Validate against an allowlist of real profile columns (typed, unknown
      // keys stripped). `id` is already omitted by the insert schema; we also
      // drop `userId` so the body can never reassign the row's owner.
      const parsed = insertUserProfileSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid profile data", details: parsed.error.errors });
      }
      const { userId: _ignoreUserId, ...updates } = parsed.data;
      const profile = await storage.updateProfile(id, updates);
      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // AUTHENTICATED self-service account deletion. Removes ALL of the caller's
  // own data (claims.sub only, never another user): the profile(s) — which
  // cascade to srs_states / training_sessions / session_events — plus usage
  // and vocal-session rows keyed by userId, and finally the users row.
  //
  // Two safety steps surround the local delete:
  //  1. Any live Stripe subscription is cancelled FIRST, so a deleted account is
  //     never billed afterwards. If Stripe can't be reached we abort (502) rather
  //     than wipe the account and leave the user paying with no portal access.
  //  2. The server destroys the session itself afterwards, so access is revoked
  //     even if the client never reaches the /api/logout redirect.
  app.delete("/api/account", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const { db: dbModule } = await import("./db");
      const { users, userProfiles, usageEvents, vocalSessions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { authStorage } = await import("./replit_integrations/auth");

      // 1. Cancel external billing before we remove the local record. A free user
      // with no Stripe customer skips this entirely.
      const account = await authStorage.getUser(userId);
      if (account?.stripeCustomerId) {
        try {
          const { getUncachableStripeClient } = await import("./stripeClient");
          const stripe = await getUncachableStripeClient();
          const subs = await stripe.subscriptions.list({
            customer: account.stripeCustomerId,
            status: "all",
            limit: 100,
          });
          const billable = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);
          for (const sub of subs.data) {
            if (billable.has(sub.status)) {
              await stripe.subscriptions.cancel(sub.id);
            }
          }
        } catch (stripeErr) {
          console.error("Failed to cancel Stripe subscription during account deletion:", stripeErr);
          return res.status(502).json({
            error:
              "Impossible d'annuler ton abonnement pour le moment. Réessaie, ou annule-le depuis « Gérer mon abonnement » avant de supprimer ton compte.",
          });
        }
      }

      // 2. Remove the user's uploaded avatar from object storage (best-effort).
      // Failure here must not block account deletion; an orphaned file is far
      // less bad than leaving the account undeleted, so we only log on error.
      if (account?.customImageUrl) {
        try {
          const { ObjectStorageService } = await import("./replit_integrations/object_storage");
          await new ObjectStorageService().deleteObjectEntity(account.customImageUrl);
        } catch (storageErr) {
          console.error("Failed to delete avatar during account deletion:", storageErr);
        }
      }

      // 3. Remove all local data for this user.
      await dbModule.transaction(async (tx: any) => {
        await tx.delete(userProfiles).where(eq(userProfiles.userId, userId));
        await tx.delete(usageEvents).where(eq(usageEvents.userId, userId));
        await tx.delete(vocalSessions).where(eq(vocalSessions.userId, userId));
        await tx.delete(users).where(eq(users.id, userId));
      });

      // 4. Invalidate the session server-side so the now-deleted account can't
      // keep making authenticated requests if the client redirect is skipped.
      req.logout((logoutErr: any) => {
        if (logoutErr) console.error("logout after account deletion failed:", logoutErr);
        const done = () => {
          res.clearCookie("connect.sid");
          res.json({ success: true });
        };
        if (req.session) {
          req.session.destroy((destroyErr: any) => {
            if (destroyErr) console.error("session destroy after account deletion failed:", destroyErr);
            done();
          });
        } else {
          done();
        }
      });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Narrow, AUTHENTICATED route to persist the interlocutor gender preference.
  // This is what the client uses: it enforces ownership and validates the single
  // field, so a user can only change the interlocutor gender on their own profile.
  app.patch("/api/profiles/:id/interlocutor-gender", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const parsed = genderSchema.safeParse(req.body.interlocutorGender);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid interlocutorGender" });
      }
      const existing = await storage.getProfile(id);
      if (!existing) {
        return res.status(404).json({ error: "Profile not found" });
      }
      const authUserId = req.user?.claims?.sub;
      if (!existing.userId || existing.userId !== authUserId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const profile = await storage.updateProfile(id, { interlocutorGender: parsed.data });
      res.json(profile);
    } catch (error) {
      console.error("Error updating interlocutor gender:", error);
      res.status(500).json({ error: "Failed to update interlocutor gender" });
    }
  });

  // Persist a user-uploaded avatar. The client first uploads the file directly to
  // object storage via a presigned URL (POST /api/uploads/request-url), then calls
  // this with the returned upload URL. We normalise it to an /objects/... path,
  // mark it public-readable (owned by the user), and store it on the user record.
  // Sending an empty/null imageUrl clears it and falls back to the OAuth avatar.
  app.put("/api/account/profile-image", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const rawUrl = req.body?.imageUrl;
      const { authStorage } = await import("./replit_integrations/auth");

      // The currently stored avatar (if any) is deleted once the new one is in
      // place, so we don't accumulate orphaned files on re-uploads or clears.
      const previousImageUrl = (await authStorage.getUser(userId))?.customImageUrl ?? null;
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const objectStorageService = new ObjectStorageService();

      // Best-effort cleanup of the previous avatar. Never block the update on it.
      const deletePrevious = async () => {
        if (!previousImageUrl) return;
        try {
          await objectStorageService.deleteObjectEntity(previousImageUrl);
        } catch (storageErr) {
          console.error("Failed to delete previous avatar:", storageErr);
        }
      };

      if (!rawUrl) {
        const cleared = await authStorage.updateCustomImage(userId, null);
        await deletePrevious();
        return res.json(cleared);
      }

      if (typeof rawUrl !== "string") {
        return res.status(400).json({ error: "imageUrl must be a string" });
      }

      // Only allow claiming an object the caller actually uploaded. The upload
      // route namespaces objects under uploads/<userId>/..., so reject anything
      // outside this user's namespace to prevent ACL takeover of others' objects.
      const normalized = objectStorageService.normalizeObjectEntityPath(rawUrl);
      const ownedPrefix = `/objects/uploads/${encodeURIComponent(userId)}/`;
      if (!normalized.startsWith(ownedPrefix)) {
        return res.status(403).json({ error: "Cannot claim this object" });
      }

      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(rawUrl, {
        owner: userId,
        visibility: "public",
      });

      const updated = await authStorage.updateCustomImage(userId, objectPath);
      // Don't delete if somehow the same path is being re-saved.
      if (previousImageUrl && previousImageUrl !== objectPath) {
        await deletePrevious();
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating profile image:", error);
      res.status(500).json({ error: "Failed to update profile image" });
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

  app.post("/api/flashcards/generate-answer", isAuthenticated, quotaGuard("flashcard"), async (req, res) => {
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

      const result = await generateModelAnswer(profile, card, userAnswer);

      // Scoring must never block the model answer. If it fails (e.g. the scoring
      // provider times out or errors), still return the answer so the user always
      // sees "la réponse Bagou" instead of an empty screen.
      let finalScoring;
      try {
        finalScoring = await scoreUserAnswer(profile, card, userAnswer, result.modelAnswer);
      } catch (scoreError) {
        console.error("scoreUserAnswer failed; returning model answer without scoring:", scoreError);
        finalScoring = {
          pass: true,
          ratingSuggested: "medium" as const,
          oneFix: "",
          redoPrompt: "",
          feedback: "",
        };
      }

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

  app.get("/api/dashboard/:profileId", isAuthenticated, async (req: any, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      if (profile.userId !== req.user?.claims?.sub) {
        return res.status(403).json({ error: "Access denied" });
      }
      const [aggregate, stats] = await Promise.all([
        storage.getDashboardAggregate(profileId),
        storage.getStats(profileId),
      ]);
      res.json({
        ...aggregate,
        masteredCards: stats.masteredCards,
        totalCards: stats.totalCards,
        weakPoints: stats.weakPoints,
      });
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      res.status(500).json({ error: "Failed to fetch dashboard" });
    }
  });

  app.get("/api/dashboard/:profileId/analysis", isAuthenticated, async (req: any, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      if (profile.userId !== req.user?.claims?.sub) {
        return res.status(403).json({ error: "Access denied" });
      }

      const [aggregate, stats] = await Promise.all([
        storage.getDashboardAggregate(profileId),
        storage.getStats(profileId),
      ]);

      if (aggregate.totals.cards === 0 && aggregate.totals.debriefs === 0) {
        return res.json({
          bilan: "Pas encore assez de données. Lance quelques sessions et reviens : je te ferai un vrai bilan.",
          pointsForts: [],
          pointsFaibles: [],
          axesAmelioration: [],
          empty: true,
        });
      }

      const today = new Date().toISOString().split("T")[0];
      const ratingSum = aggregate.ratingDist.hard + aggregate.ratingDist.medium + aggregate.ratingDist.easy;
      const sig = `${today}:${aggregate.totals.debriefs}:${aggregate.totals.cards}:${stats.masteredCards}:${ratingSum}`;
      const cached = dashboardAnalysisCache.get(String(profileId));
      if (cached && cached.sig === sig) {
        return res.json({ ...cached.data, cached: true });
      }

      const analysis = await generateDashboardAnalysis(profile, {
        totalSessions: aggregate.totals.sessions,
        totalCards: aggregate.totals.cards,
        masteredCards: stats.masteredCards,
        ratingDist: aggregate.ratingDist,
        avgScores: aggregate.avgScores,
        recentStrengths: aggregate.recentStrengths,
        recentImprovements: aggregate.recentImprovements,
        weakTags: stats.weakPoints.map((w) => w.tag.replace(/_/g, " ")),
        todayCards: aggregate.today.cards,
        todaySessions: aggregate.today.sessions,
      });
      dashboardAnalysisCache.set(String(profileId), { sig, data: analysis });
      res.json(analysis);
    } catch (error) {
      console.error("Error generating dashboard analysis:", error);
      res.status(500).json({ error: "Failed to generate dashboard analysis" });
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

  // ─── Admin Auth ────────────────────────────────────────────────────────────

  app.post("/api/admin/login", async (req: any, res) => {
    try {
      const { username, password } = req.body;
      const adminUsername = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!adminUsername || !adminPassword) {
        return res.status(500).json({ error: "Admin credentials not configured" });
      }

      if (username === adminUsername && password === adminPassword) {
        req.session.adminLoggedIn = true;
        req.session.save((err: any) => {
          if (err) return res.status(500).json({ error: "Session error" });
          res.json({ ok: true });
        });
      } else {
        res.status(401).json({ error: "Identifiants incorrects" });
      }
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/admin/logout", (req: any, res) => {
    req.session.adminLoggedIn = false;
    req.session.save(() => res.json({ ok: true }));
  });

  app.get("/api/admin/check", (req: any, res) => {
    res.json({ ok: req.session?.adminLoggedIn === true });
  });

  // ─── Admin Card Management ─────────────────────────────────────────────────

  app.post("/api/admin/generate-cards", isAdminSession, async (req: any, res) => {
    try {
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

  app.post("/api/admin/preview-cards", isAdminSession, async (req: any, res) => {
    try {
      const { themeId, themeLabel, subthemeId, subthemeLabel, subthemeIntents, subthemeExamples, count } = req.body;

      if (!themeId || !subthemeId) {
        return res.status(400).json({ error: "themeId and subthemeId required" });
      }

      const { generateCardsForPreview } = await import("./seed-cards");
      const cards = await generateCardsForPreview(
        themeId,
        themeLabel || themeId,
        subthemeId,
        subthemeLabel || subthemeId,
        subthemeIntents || ["open", "respond", "close"],
        subthemeExamples || [],
        Math.min(count || 10, 50)
      );

      res.json({ cards });
    } catch (error) {
      console.error("Error generating preview cards:", error);
      res.status(500).json({ error: "Failed to generate preview cards" });
    }
  });

  app.post("/api/admin/bulk-save-cards", isAdminSession, async (req: any, res) => {
    try {
      const { cards } = req.body;

      if (!Array.isArray(cards) || cards.length === 0) {
        return res.status(400).json({ error: "No cards to save" });
      }

      const finalCards = cards.map((card: any) => ({
        ...card,
        cardId: card.cardId.replace("_PREV_", "_"),
      }));

      await storage.createMotherCards(finalCards);
      res.json({ success: true, saved: finalCards.length });
    } catch (error) {
      console.error("Error saving bulk cards:", error);
      res.status(500).json({ error: "Failed to save cards" });
    }
  });

  app.post("/api/admin/generate-subtheme", isAdminSession, async (req: any, res) => {
    try {
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

  app.get("/api/admin/themes", isAdminSession, async (req: any, res) => {
    try {
      const { THEMES_CONFIG } = await import("./seed-cards");
      res.json(THEMES_CONFIG);
    } catch (error) {
      console.error("Error fetching themes:", error);
      res.status(500).json({ error: "Failed to fetch themes" });
    }
  });

  app.get("/api/admin/users", isAdminSession, async (req: any, res) => {
    try {
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const allUsers = await dbModule.select().from(users);
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // On-demand orphaned-avatar reconciliation. Best-effort avatar cleanup on the
  // user-facing flows can leave orphans behind during a transient storage
  // outage; this sweep finds and removes them. Safe to re-run (idempotent) and
  // never deletes an object still referenced by a live user.
  app.post("/api/admin/avatars/reconcile", isAdminSession, async (req: any, res) => {
    try {
      const { reconcileOrphanedAvatars } = await import("./avatar-reconciliation");
      const dryRun = req.body?.dryRun === true;
      const result = await reconcileOrphanedAvatars({ dryRun });
      res.json({ ...result, dryRun });
    } catch (error) {
      console.error("Error reconciling orphaned avatars:", error);
      res.status(500).json({ error: "Failed to reconcile orphaned avatars" });
    }
  });

  app.patch("/api/admin/users/:id/admin", isAdminSession, async (req: any, res) => {
    try {
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { isAdmin } = req.body;
      const [updated] = await dbModule.update(users).set({ isAdmin }).where(eq(users.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/cards/:cardId", isAdminSession, async (req: any, res) => {
    try {
      await storage.deleteMotherCard(req.params.cardId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting card:", error);
      res.status(500).json({ error: "Failed to delete card" });
    }
  });

  app.patch("/api/admin/cards/:cardId", isAdminSession, async (req: any, res) => {
    try {
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

  app.get("/api/admin/cards/leaks", isAdminSession, async (req: any, res) => {
    try {
      const { detectSituationLeak } = await import("./leak-detection");
      const language = (req.query.language as string) || "fr";
      const cards = await storage.getAllMotherCards(language);
      const leaks = cards
        .map((c) => ({ card: c, result: detectSituationLeak(c.situation) }))
        .filter((x) => x.result.isLeak)
        .map((x) => ({
          cardId: x.card.cardId,
          themeId: x.card.themeId,
          subthemeId: x.card.subthemeId,
          situation: x.card.situation,
          matches: x.result.matches,
        }));
      res.json({ total: cards.length, leakCount: leaks.length, leaks });
    } catch (error) {
      console.error("Error scanning card leaks:", error);
      res.status(500).json({ error: "Failed to scan card leaks" });
    }
  });

  app.post("/api/admin/cards/:cardId/fix-leak", isAdminSession, async (req: any, res) => {
    try {
      const { rewriteSituationWithoutLeak, detectSituationLeak } = await import("./leak-detection");
      const card = await storage.getMotherCard(req.params.cardId);
      if (!card) {
        return res.status(404).json({ error: "Card not found" });
      }
      let newSituation = card.situation;
      for (let attempt = 0; attempt < 3; attempt++) {
        newSituation = await rewriteSituationWithoutLeak({
          situation: newSituation,
          otherRole: card.otherRole,
          speakerRole: card.speakerRole,
          relationship: card.relationship,
          userGoal: card.userGoal,
          channel: card.channel,
        });
        if (!detectSituationLeak(newSituation).isLeak) break;
      }
      const updated = await storage.updateMotherCard(card.cardId, { situation: newSituation });
      const result = detectSituationLeak(newSituation);
      res.json({ card: updated, stillLeaks: result.isLeak, matches: result.matches });
    } catch (error) {
      console.error("Error fixing card leak:", error);
      res.status(500).json({ error: "Failed to fix card leak" });
    }
  });

  app.get("/api/admin/settings", isAdminSession, async (req: any, res) => {
    try {
      const settings = await storage.getAllAdminSettings();
      const current = getAIRuntimeConfig();
      res.json({
        scoring_model: settings.scoring_model || current.scoringProvider,
        generation_model: settings.generation_model || current.generationProvider,
        bagou_system_extra: settings.bagou_system_extra || "",
        dialogue_turns: parseInt(settings.dialogue_turns || "3"),
        tts_model: settings.tts_model || "tts-1",
        tts_voice: settings.tts_voice || "nova",
        response_timer_seconds: parseInt(settings.response_timer_seconds || "0"),
      });
    } catch (error) {
      console.error("Error fetching admin settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings", isAdminSession, async (req: any, res) => {
    try {
      const { scoring_model, generation_model, bagou_system_extra, dialogue_turns, tts_model, tts_voice, response_timer_seconds } = req.body;

      if (scoring_model) await storage.setAdminSetting("scoring_model", scoring_model);
      if (generation_model) await storage.setAdminSetting("generation_model", generation_model);
      if (bagou_system_extra !== undefined) await storage.setAdminSetting("bagou_system_extra", bagou_system_extra);
      if (dialogue_turns !== undefined) await storage.setAdminSetting("dialogue_turns", String(dialogue_turns));
      if (tts_model) await storage.setAdminSetting("tts_model", tts_model);
      if (tts_voice) await storage.setAdminSetting("tts_voice", tts_voice);
      if (response_timer_seconds !== undefined) await storage.setAdminSetting("response_timer_seconds", String(response_timer_seconds));

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

  app.get("/api/settings/public", async (req, res) => {
    try {
      const settings = await storage.getAllAdminSettings();
      res.json({
        response_timer_seconds: parseInt(settings.response_timer_seconds || "0"),
        dialogue_turns: parseInt(settings.dialogue_turns || "3"),
      });
    } catch (error) {
      res.json({ response_timer_seconds: 0, dialogue_turns: 3 });
    }
  });

  app.patch("/api/admin/users/:id/subscription", isAdminSession, async (req: any, res) => {
    try {
      const { subscriptionStatus, subscriptionExpiresAt } = req.body;
      const updateData: any = {};
      if (subscriptionStatus !== undefined) updateData.subscriptionStatus = subscriptionStatus;
      if (subscriptionExpiresAt !== undefined) updateData.subscriptionExpiresAt = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;

      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await dbModule.update(users).set(updateData).where(eq(users.id, req.params.id)).returning();
      res.json(updated);
    } catch (error) {
      console.error("Error updating subscription:", error);
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  app.delete("/api/admin/users/:id", isAdminSession, async (req: any, res) => {
    try {
      const { db: dbModule } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await dbModule.delete(users).where(eq(users.id, req.params.id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.get("/api/admin/stats", isAdminSession, async (req: any, res) => {
    try {
      const { db: dbModule } = await import("./db");
      const { users, trainingSessions } = await import("@shared/schema");
      const { gte, sql: sqlExpr } = await import("drizzle-orm");

      const allUsers = await dbModule.select().from(users);
      const cardCount = await storage.getMotherCardCount();

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentSessions = await dbModule.select().from(trainingSessions)
        .where(gte(trainingSessions.createdAt, sevenDaysAgo));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const newUsersThisMonth = allUsers.filter(u =>
        u.createdAt && new Date(u.createdAt) >= thirtyDaysAgo
      ).length;

      const subStats = {
        none: allUsers.filter(u => !u.subscriptionStatus || u.subscriptionStatus === "none").length,
        trial: allUsers.filter(u => u.subscriptionStatus === "trial").length,
        active: allUsers.filter(u => u.subscriptionStatus === "active").length,
        expired: allUsers.filter(u => u.subscriptionStatus === "expired").length,
      };

      res.json({
        totalUsers: allUsers.length,
        newUsersThisMonth,
        totalCards: cardCount,
        sessionsThisWeek: recentSessions.length,
        subscriptions: subStats,
        recentUsers: allUsers
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, 5)
          .map(u => ({
            id: u.id,
            name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Anonyme",
            email: u.email,
            subscriptionStatus: u.subscriptionStatus,
            createdAt: u.createdAt,
          })),
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ── Client console (reporting layer over app tables + read-only stripe schema) ──

  app.get("/api/admin/clients", isAdminSession, async (_req: any, res) => {
    try {
      const clients = await listClients();
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.get("/api/admin/kpis", isAdminSession, async (_req: any, res) => {
    try {
      const kpis = await getKpis();
      res.json(kpis);
    } catch (error) {
      console.error("Error fetching kpis:", error);
      res.status(500).json({ error: "Failed to fetch kpis" });
    }
  });

  app.get("/api/admin/clients/:id", isAdminSession, async (req: any, res) => {
    try {
      const detail = await getClientDetail(req.params.id);
      if (!detail) {
        res.status(404).json({ error: "Client not found" });
        return;
      }
      res.json(detail);
    } catch (error) {
      console.error("Error fetching client detail:", error);
      res.status(500).json({ error: "Failed to fetch client detail" });
    }
  });

  const optionalDateString = z
    .string()
    .trim()
    .min(1)
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Date invalide" });

  const grantPremiumSchema = z.object({
    expiresAt: optionalDateString.nullish(),
  });

  const extendTrialSchema = z
    .object({
      days: z.number().int().positive().max(365).optional(),
      expiresAt: optionalDateString.optional(),
    })
    .refine((v) => v.days !== undefined || v.expiresAt !== undefined, {
      message: "Indiquez une durée ou une date d'expiration",
    });

  async function setOverride(
    userId: string,
    subscriptionStatus: string,
    subscriptionExpiresAt: Date | null,
  ) {
    const { db: dbModule } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const [updated] = await dbModule
      .update(users)
      .set({ subscriptionStatus, subscriptionExpiresAt })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  // Grant complimentary Premium (manual override, NOT a Stripe charge).
  app.post("/api/admin/users/:id/grant-premium", isAdminSession, async (req: any, res) => {
    try {
      const parsed = grantPremiumSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Requête invalide" });
        return;
      }
      const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
      const updated = await setOverride(req.params.id, "active", expiresAt);
      if (!updated) {
        res.status(404).json({ error: "Client not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      console.error("Error granting premium:", error);
      res.status(500).json({ error: "Failed to grant premium" });
    }
  });

  // Revoke a manual override, returning the user to their Stripe/free state.
  app.post("/api/admin/users/:id/revoke-premium", isAdminSession, async (req: any, res) => {
    try {
      const updated = await setOverride(req.params.id, "none", null);
      if (!updated) {
        res.status(404).json({ error: "Client not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      console.error("Error revoking premium:", error);
      res.status(500).json({ error: "Failed to revoke premium" });
    }
  });

  // Grant / extend a complimentary trial via manual override.
  app.post("/api/admin/users/:id/extend-trial", isAdminSession, async (req: any, res) => {
    try {
      const parsed = extendTrialSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Requête invalide" });
        return;
      }
      let expiresAt: Date;
      if (parsed.data.expiresAt) {
        expiresAt = new Date(parsed.data.expiresAt);
      } else {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (parsed.data.days ?? 7));
      }
      const updated = await setOverride(req.params.id, "trial", expiresAt);
      if (!updated) {
        res.status(404).json({ error: "Client not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      console.error("Error extending trial:", error);
      res.status(500).json({ error: "Failed to extend trial" });
    }
  });

  app.post("/api/session/opening", isAuthenticated, quotaGuard("vocal_session"), async (req, res) => {
    try {
      const { cardId, profileId } = req.body;
      if (!cardId) return res.status(400).json({ error: "Missing cardId" });

      const card = await storage.getMotherCard(cardId);
      if (!card) return res.status(404).json({ error: "Card not found" });

      const profile = profileId ? await storage.getProfile(parseInt(profileId)) : null;
      // Gender drives persona name/pronouns + TTS voice. Prefer the explicit
      // per-session choice from the client, fall back to the stored profile pref.
      const genderParsed = genderSchema.safeParse(req.body.interlocutorGender);
      const gender = genderParsed.success
        ? genderParsed.data
        : ((profile?.interlocutorGender as (typeof interlocutorGenderEnum)[number]) ?? "femme");
      const { generateOpeningLine } = await import("./ai");
      const [openingLine, persona] = await Promise.all([
        generateOpeningLine(card, profile),
        generateScenePersona(card, profile, gender),
      ]);
      // Persona objective/tactics are hidden — keep server-side, never send to client.
      setPersona(personaKey(profileId ?? "anon", cardId, gender), persona);
      // Create one metered session row and return a signed token for it. dialogue-turn
      // claims turns against this row and refuses once the conversation is closed, so a
      // free user can't reuse one charged start to run extra conversations.
      const sessionToken = await startVocalSession((req as any).user.claims.sub, cardId);
      res.json({ openingLine, sessionToken });
    } catch (error) {
      console.error("Error generating opening line:", error);
      res.status(500).json({ error: "Failed to generate opening line" });
    }
  });

  app.post("/api/session/dialogue-turn", isAuthenticated, async (req, res) => {
    try {
      const { profileId, cardId, history, userMessage, turnNumber, isProposalRewrite } = req.body;

      if (!profileId || !cardId || !userMessage) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Claim a turn against the metered session row created by /api/session/opening
      // (where the weekly vocal quota is charged). This rejects a replayed token once
      // its conversation has closed, so a free user can't run extra conversations on a
      // single charged start. State lives in the DB row, so it survives a restart.
      const userId = (req as any).user.claims.sub as string;
      const claim = await claimVocalTurn(req.body.sessionToken, { userId, cardId });
      if (!claim) {
        return res.status(403).json({ error: "Invalid or expired session" });
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

      // Persona is resolved server-side only. On cache miss (e.g. server
      // restarted mid-session), regenerate and re-cache so the interlocutor
      // stays coherent for the rest of the conversation.
      // Prefer the gender the client sent for this session (kept in sync with the
      // opening/TTS calls) and fall back to the stored profile preference, so a
      // failed/stale gender persist can't desync the dialogue from the opening.
      const genderParsed = genderSchema.safeParse(req.body.interlocutorGender);
      const gender = genderParsed.success
        ? genderParsed.data
        : ((profile.interlocutorGender as (typeof interlocutorGenderEnum)[number]) ?? "femme");
      const pKey = personaKey(profileId, cardId, gender);
      let persona = getPersona(pKey);
      if (!persona) {
        persona = await generateScenePersona(card, profile, gender);
        setPersona(pKey, persona);
      }

      // Use the server-tracked turn count so a client can't dodge the turn cap by
      // replaying a low turnNumber; still honor an explicit over-time signal (999).
      const effectiveTurn = Math.max(Number(turnNumber) || 1, claim.turnCount);
      const result = await generateDialogueTurnWithEval(
        profile,
        card,
        history || [],
        userMessage,
        effectiveTurn,
        maxTurns,
        persona
      );

      if (isProposalRewrite && result.turnEval.score !== "strong") {
        result.turnEval.score = "strong";
        result.turnEval.comment = "Bien repris — tu as utilisé une des répliques proposées. C'est exactement ça.";
      }

      // Conversation over (AI concluded or the turn cap was reached): close the row
      // so its token can't be replayed to start another conversation.
      if (result.isFinalTurn || claim.turnCount >= maxTurns) {
        await closeVocalSession(claim.sessionId);
      }

      res.json({ ...result, maxTurns });
    } catch (error) {
      console.error("Error generating dialogue turn:", error);
      res.status(500).json({ error: "Failed to generate dialogue turn" });
    }
  });

  app.post("/api/tts", isAuthenticated, async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "No text provided" });
      }
      const settings = await storage.getAllAdminSettings();
      const adminVoice = (settings.tts_voice || "nova") as
        | "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
      // The roleplay interlocutor (VocalStep) sends its gender so the voice
      // matches the character: homme -> onyx (male), femme -> nova (female).
      // Other callers (model answer / debrief read-aloud) omit it and keep the
      // admin-configured voice.
      const genderParsed = genderSchema.safeParse(req.body.interlocutorGender);
      const voice = genderParsed.success
        ? (genderParsed.data === "homme" ? "onyx" : "nova")
        : adminVoice;
      const buffer = await textToSpeech(text.slice(0, 1200), voice, "mp3");
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "no-store");
      res.send(buffer);
    } catch (error) {
      console.error("TTS error:", error);
      res.status(500).json({ error: "TTS failed" });
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
