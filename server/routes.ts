import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { generateModelAnswer, scoreUserAnswer, generateRoleplayTurn, generateDebrief } from "./ai";
import { insertUserProfileSchema, insertSessionSchema, insertSessionEventSchema } from "@shared/schema";
import { z } from "zod";

// SRS algorithm (Anki-style SM-2)
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
  // =========== PROFILES ===========
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

  // =========== FLASHCARDS ===========
  app.get("/api/flashcards/due/:profileId", async (req, res) => {
    try {
      const profileId = parseInt(req.params.profileId);
      const today = new Date().toISOString().split("T")[0];
      
      const profile = await storage.getProfile(profileId);
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const dueStates = await storage.getDueCards(profileId, today);
      
      if (dueStates.length === 0) {
        const allCards = await storage.getAllMotherCards(profile.language);
        const cardsToReview = allCards.slice(0, 5);
        
        const results = [];
        for (const card of cardsToReview) {
          const srsState = await storage.getOrCreateSrsState(profileId, card.cardId);
          results.push({ card, srsState });
        }
        return res.json(results);
      }

      const results = [];
      for (const state of dueStates.slice(0, 10)) {
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

      const result = await generateModelAnswer(profile, card, userAnswer);
      const scoring = await scoreUserAnswer(profile, card, userAnswer, result.modelAnswer);

      res.json({
        modelAnswer: result.modelAnswer,
        variants: result.variants,
        rubric: result.rubric,
        feedback: scoring,
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

  // =========== SCENARIOS ===========
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

  // =========== ROLEPLAY ===========
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

  // =========== DEBRIEF ===========
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

  // =========== SESSIONS ===========
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

  // =========== STATS ===========
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

  // =========== SEED DATA ===========
  app.post("/api/seed", async (req, res) => {
    try {
      await seedDatabase();
      res.json({ success: true, message: "Database seeded successfully" });
    } catch (error) {
      console.error("Error seeding database:", error);
      res.status(500).json({ error: "Failed to seed database" });
    }
  });
}

// Seed data function
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
      situation: "Tu es à une soirée d'anniversaire. Tu vois quelqu'un que tu ne connais pas assis seul sur le canapé. Comment tu engages la conversation ?",
      speakerRole: "invité",
      otherRole: "invité inconnu",
      relationship: "strangers",
      stakes: "low",
      userGoal: "Engager une conversation légère et naturelle avec un inconnu",
      constraints: ["Pas de question fermée", "Éviter les sujets trop personnels", "Rester léger et observationnel"],
      tags: ["ice_breaker", "party", "small_talk"],
      antiPatterns: ["Poser une question trop intime", "Parler uniquement de soi", "Être trop direct"],
      targetVibe: "Détendu, curieux, accessible",
      modelAnswerRules: ["Observation + question ouverte", "Touche d'humour légère", "Laisser de l'espace pour la réponse"],
      variantRulesSafe: ["Classique et poli", "Question simple sur l'événement"],
      variantRulesMedium: ["Un peu de personnalité", "Observation originale"],
      variantRulesBold: ["Humour assumé", "Approche décalée mais respectueuse"],
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
      situation: "Un ami te montre un nouveau projet créatif sur lequel il a travaillé. Comment tu lui fais un compliment authentique ?",
      speakerRole: "ami",
      otherRole: "ami créateur",
      relationship: "friends",
      stakes: "low",
      userGoal: "Faire un compliment sincère qui valorise l'effort et le résultat",
      constraints: ["Être spécifique", "Éviter les formules creuses", "Montrer que tu as vraiment regardé"],
      tags: ["compliment", "friendship", "encouragement"],
      antiPatterns: ["'C'est cool' sans précision", "Comparer à quelque chose de négatif", "Changer de sujet trop vite"],
      targetVibe: "Chaleureux, sincère, enthousiaste",
      modelAnswerRules: ["Mentionner un détail spécifique", "Exprimer une émotion", "Poser une question sur le processus"],
      variantRulesSafe: ["Compliment classique et sincère"],
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
      speakerRole: "employé",
      otherRole: "manager",
      relationship: "professional_hierarchy",
      stakes: "medium",
      userGoal: "Refuser la demande tout en maintenant une bonne relation professionnelle",
      constraints: ["Être ferme mais respectueux", "Proposer une alternative", "Ne pas trop se justifier"],
      tags: ["assertiveness", "work_life_balance", "boundary"],
      antiPatterns: ["S'excuser excessivement", "Mentir sur la raison", "Accepter à contrecœur"],
      targetVibe: "Professionnel, calme, assertif",
      modelAnswerRules: ["Exprimer la limite clairement", "Proposer une solution", "Rester concis"],
      variantRulesSafe: ["Diplomatique avec excuse légère"],
      variantRulesMedium: ["Direct mais proposant une alternative"],
      variantRulesBold: ["Très direct, pas d'excuse"],
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
      situation: "Tu reçois ton plat au restaurant et il est froid. Comment tu fais remarquer le problème au serveur ?",
      speakerRole: "client",
      otherRole: "serveur",
      relationship: "service",
      stakes: "low",
      userGoal: "Obtenir un plat chaud sans créer de tension",
      constraints: ["Rester poli", "Être factuel", "Donner une chance de corriger"],
      tags: ["complaint", "restaurant", "service"],
      antiPatterns: ["Être passif-agressif", "S'emporter", "Ignorer le problème"],
      targetVibe: "Calme, factuel, assertif",
      modelAnswerRules: ["Constater le fait", "Demander poliment", "Remercier la prise en charge"],
      variantRulesSafe: ["Très poli avec beaucoup de précaution"],
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
      situation: "Tu discutes avec quelqu'un qui te plaît sur une app de rencontre. La personne dit qu'elle adore les films d'horreur. Comment tu rebondis de manière taquine ?",
      speakerRole: "utilisateur",
      otherRole: "match",
      relationship: "potential_romantic",
      stakes: "low",
      userGoal: "Créer du jeu et de la légèreté dans la conversation",
      constraints: ["Rester léger", "Ne pas être méchant", "Montrer de l'intérêt"],
      tags: ["flirting", "dating", "teasing"],
      antiPatterns: ["Être condescendant", "Trop d'accord sur tout", "Réponse plate"],
      targetVibe: "Joueur, léger, charmeur",
      modelAnswerRules: ["Taquinerie gentille", "Question ou challenge ludique", "Montrer sa personnalité"],
      variantRulesSafe: ["Intérêt sincère avec légère taquinerie"],
      variantRulesMedium: ["Taquinerie assumée avec question maligne"],
      variantRulesBold: ["Challenge ludique plus prononcé"],
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
      title: "La soirée entre amis d'amis",
      context: "Tu es à une soirée organisée par ton ami Marc. Il y a beaucoup de gens que tu ne connais pas. Julie, une amie de Marc, vient vers toi.",
      objective: "Avoir une conversation fluide et agréable avec Julie, faire bonne impression",
      constraints: ["Rester authentique", "Trouver des points communs", "Ne pas monopoliser la parole"],
      startingMessage: "Hey ! Tu dois être un ami de Marc, non ? Moi c'est Julie. Tu connais beaucoup de monde ici ?",
      aiName: "Julie",
      aiPersona: "Jeune femme sociable, curieuse, travaille dans l'événementiel. Aime les conversations légères mais apprécie aussi la profondeur.",
      aiStance: "Ouverte et accueillante, pose des questions, réagit positivement",
      aiBoundaries: ["Ne devient pas trop personnelle trop vite", "Reste polie même si mal à l'aise"],
      userName: "Toi",
      userFrame: "Nouveau à la soirée, cherche à socialiser naturellement",
      targetSkills: ["small_talk", "listening", "building_rapport"],
      difficulty: "n1",
      durationSecondsTarget: 180,
      turnsMin: 6,
      turnsMax: 10,
      phase1: "Introduction et découverte mutuelle",
      phase2: "Approfondissement des points communs",
      phase3: "Clôture naturelle ou échange de contacts",
      successEndings: ["Échange de numéro", "Proposition de se revoir", "Conversation mémorable"],
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
      context: "Tu travailles dans cette entreprise depuis 2 ans. Tu as obtenu de bons résultats et tu estimes mériter une augmentation. Tu as rdv avec ton manager.",
      objective: "Obtenir une augmentation ou au moins ouvrir une négociation sérieuse",
      constraints: ["Rester professionnel", "Argumenter avec des faits", "Gérer les objections"],
      startingMessage: "Ah, assieds-toi. Alors, tu voulais me voir ? De quoi s'agit-il ?",
      aiName: "Antoine",
      aiPersona: "Manager de 45 ans, pragmatique, apprécie les employés mais doit gérer les budgets. Juste mais ferme.",
      aiStance: "Écoute, pose des questions, présente des objections raisonnables",
      aiBoundaries: ["Ne s'énerve pas", "Reste professionnel", "Peut dire non mais explique"],
      userName: "Toi",
      userFrame: "Employé motivé qui veut être reconnu à sa juste valeur",
      targetSkills: ["assertiveness", "negotiation", "handling_objections"],
      difficulty: "n2",
      durationSecondsTarget: 240,
      turnsMin: 8,
      turnsMax: 12,
      phase1: "Présentation de la demande",
      phase2: "Gestion des objections",
      phase3: "Négociation et accord",
      successEndings: ["Augmentation accordée", "Plan d'action défini", "Discussion constructive"],
      failureEndings: ["Refus sec", "Malaise relationnel", "Arguments non entendus"],
      linkedCardIds: ["FC_PRO_001"],
    },
  ];

  for (const scenarioData of scenariosData) {
    await storage.createScenario(scenarioData);
  }

  console.log("Database seeded with sample data");
}
