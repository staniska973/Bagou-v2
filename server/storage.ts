import { db } from "./db";
import {
  userProfiles,
  motherCards,
  srsStates,
  scenarios,
  trainingSessions,
  sessionEvents,
  adminSettings,
  type UserProfile,
  type InsertUserProfile,
  type MotherCard,
  type InsertMotherCard,
  type SrsState,
  type InsertSrsState,
  type Scenario,
  type InsertScenario,
  type TrainingSession,
  type InsertTrainingSession,
  type SessionEvent,
  type InsertSessionEvent,
} from "@shared/schema";
import { eq, and, lte, sql, desc, asc, gte, or, inArray, isNull } from "drizzle-orm";

export interface DashboardAggregate {
  today: { cards: number; sessions: number; debriefs: number };
  totals: { sessions: number; cards: number; debriefs: number };
  ratingDist: { hard: number; medium: number; easy: number };
  avgScores: { clarity: number; frame: number; tone: number; concision: number } | null;
  scoreHistory: { date: string; clarity: number; frame: number; tone: number; concision: number; overall: number }[];
  recentStrengths: string[];
  recentImprovements: string[];
}

export interface IStorage {
  getProfile(id: number): Promise<UserProfile | undefined>;
  getProfileByUserId(userId: string): Promise<UserProfile | undefined>;
  createProfile(data: InsertUserProfile): Promise<UserProfile>;
  updateProfile(id: number, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;

  getMotherCard(cardId: string): Promise<MotherCard | undefined>;
  getMotherCardsByPack(packId: string): Promise<MotherCard[]>;
  getMotherCardsByTheme(themeId: string, language: string): Promise<MotherCard[]>;
  getMotherCardsBySubtheme(themeId: string, subthemeId: string, language: string): Promise<MotherCard[]>;
  getAllMotherCards(language: string): Promise<MotherCard[]>;
  getMotherCardCount(): Promise<number>;
  getCustomCardsByUser(userId: string): Promise<MotherCard[]>;
  getCustomCardCount(userId: string): Promise<number>;
  getAccessibleMotherCard(cardId: string, userId: string): Promise<MotherCard | undefined>;
  createCustomCard(data: InsertMotherCard): Promise<MotherCard>;
  deleteCustomCard(cardId: string, userId: string): Promise<boolean>;
  createMotherCard(data: InsertMotherCard): Promise<MotherCard>;
  createMotherCards(data: InsertMotherCard[]): Promise<MotherCard[]>;
  updateMotherCard(cardId: string, data: Partial<InsertMotherCard>): Promise<MotherCard | undefined>;
  deleteMotherCard(cardId: string): Promise<void>;
  deleteMotherCardsBySubtheme(themeId: string, subthemeId: string): Promise<void>;

  getAdminSetting(key: string): Promise<string | undefined>;
  setAdminSetting(key: string, value: string): Promise<void>;
  getAllAdminSettings(): Promise<Record<string, string>>;

  getSrsState(profileId: number, cardId: string): Promise<SrsState | undefined>;
  getDueCards(profileId: number, date: string): Promise<SrsState[]>;
  getWeakCards(profileId: number): Promise<SrsState[]>;
  getAllSrsStates(profileId: number): Promise<SrsState[]>;
  createSrsState(data: InsertSrsState): Promise<SrsState>;
  updateSrsState(id: number, data: Partial<InsertSrsState>): Promise<SrsState | undefined>;
  getOrCreateSrsState(profileId: number, cardId: string): Promise<SrsState>;

  getScenario(scenarioId: string): Promise<Scenario | undefined>;
  getScenariosByTheme(themeId: string, language: string): Promise<Scenario[]>;
  getAllScenarios(language: string): Promise<Scenario[]>;
  getRandomScenario(language: string, linkedCardIds?: string[]): Promise<Scenario | undefined>;
  createScenario(data: InsertScenario): Promise<Scenario>;

  getSession(id: number): Promise<TrainingSession | undefined>;
  getSessionsByProfile(profileId: number): Promise<TrainingSession[]>;
  createSession(data: InsertTrainingSession): Promise<TrainingSession>;
  updateSession(id: number, data: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined>;

  createSessionEvent(data: InsertSessionEvent): Promise<SessionEvent>;
  getSessionEvents(sessionId: number): Promise<SessionEvent[]>;

  getDashboardAggregate(profileId: number): Promise<DashboardAggregate>;

  getStats(profileId: number): Promise<{
    dueCards: number;
    masteredCards: number;
    totalCards: number;
    totalSessions: number;
    weakCards: number;
    weakPoints: { tag: string; count: number }[];
    themeProgress: { themeId: string; total: number; mastered: number; due: number }[];
  }>;
}

class DatabaseStorage implements IStorage {
  async getProfile(id: number): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.id, id));
    return profile;
  }

  async getProfileByUserId(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async createProfile(data: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db.insert(userProfiles).values(data).returning();
    return profile;
  }

  async updateProfile(id: number, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const [profile] = await db
      .update(userProfiles)
      .set(data)
      .where(eq(userProfiles.id, id))
      .returning();
    return profile;
  }

  async getMotherCard(cardId: string): Promise<MotherCard | undefined> {
    const [card] = await db.select().from(motherCards).where(eq(motherCards.cardId, cardId));
    return card;
  }

  // The getMotherCardsBy* / getAllMotherCards / getMotherCardCount getters power
  // the CURATED library (browse, due-queue fill, admin, stats). They must never
  // surface user-authored "Mode personnalisé" cards, so each filters to
  // ownerUserId IS NULL. Private custom cards are fetched via getCustomCardsByUser.
  async getMotherCardsByPack(packId: string): Promise<MotherCard[]> {
    return db
      .select()
      .from(motherCards)
      .where(and(eq(motherCards.packId, packId), isNull(motherCards.ownerUserId)));
  }

  async getMotherCardsByTheme(themeId: string, language: string): Promise<MotherCard[]> {
    return db
      .select()
      .from(motherCards)
      .where(and(
        eq(motherCards.themeId, themeId),
        eq(motherCards.language, language),
        isNull(motherCards.ownerUserId)
      ));
  }

  async getMotherCardsBySubtheme(themeId: string, subthemeId: string, language: string): Promise<MotherCard[]> {
    return db
      .select()
      .from(motherCards)
      .where(and(
        eq(motherCards.themeId, themeId),
        eq(motherCards.subthemeId, subthemeId),
        eq(motherCards.language, language),
        isNull(motherCards.ownerUserId)
      ));
  }

  async getAllMotherCards(language: string): Promise<MotherCard[]> {
    return db
      .select()
      .from(motherCards)
      .where(and(eq(motherCards.language, language), isNull(motherCards.ownerUserId)));
  }

  async getMotherCardCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(motherCards)
      .where(isNull(motherCards.ownerUserId));
    return Number(result[0].count);
  }

  // --- Custom ("Mode personnalisé") cards -------------------------------------

  async getCustomCardsByUser(userId: string): Promise<MotherCard[]> {
    return db
      .select()
      .from(motherCards)
      .where(eq(motherCards.ownerUserId, userId))
      .orderBy(desc(motherCards.createdAt));
  }

  async getCustomCardCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(motherCards)
      .where(eq(motherCards.ownerUserId, userId));
    return Number(result[0].count);
  }

  // Resolves a card only if the caller may use it: curated cards (no owner) are
  // open to everyone; a custom card is returned only to its owner. Centralizes
  // access control so session/opening + dialogue-turn can't be used to practice
  // (or probe) another user's private situation by guessing its cardId.
  async getAccessibleMotherCard(cardId: string, userId: string): Promise<MotherCard | undefined> {
    const card = await this.getMotherCard(cardId);
    if (!card) return undefined;
    if (card.ownerUserId && card.ownerUserId !== userId) return undefined;
    return card;
  }

  async createCustomCard(data: InsertMotherCard): Promise<MotherCard> {
    if (!data.ownerUserId) {
      throw new Error("createCustomCard requires ownerUserId");
    }
    const [card] = await db.insert(motherCards).values(data).returning();
    return card;
  }

  // Owner-scoped delete: removes the card only if it belongs to userId, and
  // cleans up its SRS rows so no orphan review state is left behind. Returns
  // false if the card doesn't exist or isn't owned by the caller.
  async deleteCustomCard(cardId: string, userId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [card] = await tx
        .select()
        .from(motherCards)
        .where(and(eq(motherCards.cardId, cardId), eq(motherCards.ownerUserId, userId)));
      if (!card) return false;
      await tx.delete(srsStates).where(eq(srsStates.cardId, cardId));
      await tx.delete(motherCards).where(eq(motherCards.id, card.id));
      return true;
    });
  }

  async createMotherCard(data: InsertMotherCard): Promise<MotherCard> {
    const [card] = await db.insert(motherCards).values(data).returning();
    return card;
  }

  async createMotherCards(data: InsertMotherCard[]): Promise<MotherCard[]> {
    if (data.length === 0) return [];
    return db.insert(motherCards).values(data).onConflictDoNothing({ target: motherCards.cardId }).returning();
  }

  async updateMotherCard(cardId: string, data: Partial<InsertMotherCard>): Promise<MotherCard | undefined> {
    const [card] = await db
      .update(motherCards)
      .set(data)
      .where(eq(motherCards.cardId, cardId))
      .returning();
    return card;
  }

  async deleteMotherCard(cardId: string): Promise<void> {
    await db.delete(motherCards).where(eq(motherCards.cardId, cardId));
  }

  async deleteMotherCardsBySubtheme(themeId: string, subthemeId: string): Promise<void> {
    // Curated-only: never let an admin subtheme purge wipe users' private custom cards.
    await db.delete(motherCards).where(
      and(
        eq(motherCards.themeId, themeId),
        eq(motherCards.subthemeId, subthemeId),
        isNull(motherCards.ownerUserId)
      )
    );
  }

  async getAdminSetting(key: string): Promise<string | undefined> {
    const [row] = await db.select().from(adminSettings).where(eq(adminSettings.key, key));
    return row?.value;
  }

  async setAdminSetting(key: string, value: string): Promise<void> {
    await db
      .insert(adminSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: adminSettings.key, set: { value, updatedAt: new Date() } });
  }

  async getAllAdminSettings(): Promise<Record<string, string>> {
    const rows = await db.select().from(adminSettings);
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async getSrsState(profileId: number, cardId: string): Promise<SrsState | undefined> {
    const [state] = await db
      .select()
      .from(srsStates)
      .where(and(eq(srsStates.profileId, profileId), eq(srsStates.cardId, cardId)));
    return state;
  }

  async getDueCards(profileId: number, date: string): Promise<SrsState[]> {
    return db
      .select()
      .from(srsStates)
      .where(and(eq(srsStates.profileId, profileId), lte(srsStates.dueDate, date)))
      .orderBy(asc(srsStates.dueDate));
  }

  async getWeakCards(profileId: number): Promise<SrsState[]> {
    return db
      .select()
      .from(srsStates)
      .where(
        and(
          eq(srsStates.profileId, profileId),
          or(eq(srsStates.isPriority, true), gte(srsStates.lapses, 2))
        )
      )
      .orderBy(desc(srsStates.lapses));
  }

  async getAllSrsStates(profileId: number): Promise<SrsState[]> {
    return db.select().from(srsStates).where(eq(srsStates.profileId, profileId));
  }

  async createSrsState(data: InsertSrsState): Promise<SrsState> {
    const [state] = await db.insert(srsStates).values(data).returning();
    return state;
  }

  async updateSrsState(id: number, data: Partial<InsertSrsState>): Promise<SrsState | undefined> {
    const [state] = await db
      .update(srsStates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(srsStates.id, id))
      .returning();
    return state;
  }

  async getOrCreateSrsState(profileId: number, cardId: string): Promise<SrsState> {
    let state = await this.getSrsState(profileId, cardId);
    if (!state) {
      const today = new Date().toISOString().split("T")[0];
      state = await this.createSrsState({
        profileId,
        cardId,
        dueDate: today,
        intervalDays: 1,
        ease: 2.5,
        reps: 0,
        lapses: 0,
        isPriority: false,
        needsRoleplay: false,
      });
    }
    return state;
  }

  async getScenario(scenarioId: string): Promise<Scenario | undefined> {
    const [scenario] = await db.select().from(scenarios).where(eq(scenarios.scenarioId, scenarioId));
    return scenario;
  }

  async getScenariosByTheme(themeId: string, language: string): Promise<Scenario[]> {
    return db
      .select()
      .from(scenarios)
      .where(and(eq(scenarios.themeId, themeId), eq(scenarios.language, language)));
  }

  async getAllScenarios(language: string): Promise<Scenario[]> {
    return db.select().from(scenarios).where(eq(scenarios.language, language));
  }

  async getRandomScenario(language: string, linkedCardIds?: string[]): Promise<Scenario | undefined> {
    const allScenarios = await db.select().from(scenarios).where(eq(scenarios.language, language));
    if (allScenarios.length === 0) return undefined;

    if (linkedCardIds && linkedCardIds.length > 0) {
      const linked = allScenarios.filter((s) =>
        s.linkedCardIds?.some((id) => linkedCardIds.includes(id))
      );
      if (linked.length > 0) {
        return linked[Math.floor(Math.random() * linked.length)];
      }
    }

    return allScenarios[Math.floor(Math.random() * allScenarios.length)];
  }

  async createScenario(data: InsertScenario): Promise<Scenario> {
    const [scenario] = await db.insert(scenarios).values(data).returning();
    return scenario;
  }

  async getSession(id: number): Promise<TrainingSession | undefined> {
    const [session] = await db.select().from(trainingSessions).where(eq(trainingSessions.id, id));
    return session;
  }

  async getSessionsByProfile(profileId: number): Promise<TrainingSession[]> {
    return db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.profileId, profileId))
      .orderBy(desc(trainingSessions.createdAt));
  }

  async createSession(data: InsertTrainingSession): Promise<TrainingSession> {
    const [session] = await db.insert(trainingSessions).values(data).returning();
    return session;
  }

  async updateSession(id: number, data: Partial<InsertTrainingSession>): Promise<TrainingSession | undefined> {
    const [session] = await db.update(trainingSessions).set(data).where(eq(trainingSessions.id, id)).returning();
    return session;
  }

  async createSessionEvent(data: InsertSessionEvent): Promise<SessionEvent> {
    const [event] = await db.insert(sessionEvents).values(data).returning();
    return event;
  }

  async getSessionEvents(sessionId: number): Promise<SessionEvent[]> {
    return db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, sessionId));
  }

  async getStats(profileId: number): Promise<{
    dueCards: number;
    masteredCards: number;
    totalCards: number;
    totalSessions: number;
    weakCards: number;
    weakPoints: { tag: string; count: number }[];
    themeProgress: { themeId: string; total: number; mastered: number; due: number }[];
  }> {
    const today = new Date().toISOString().split("T")[0];

    const allStates = await db
      .select()
      .from(srsStates)
      .where(eq(srsStates.profileId, profileId));

    const dueStates = allStates.filter(s => s.dueDate <= today);
    const masteredStates = allStates.filter(s => s.intervalDays >= 21);

    const sessionList = await db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.profileId, profileId));

    const lapsedStates = allStates.filter(s => s.lapses >= 1);

    const weakPoints: { tag: string; count: number }[] = [];
    for (const state of lapsedStates) {
      const card = await this.getMotherCard(state.cardId);
      if (card?.tags) {
        for (const tag of card.tags) {
          const existing = weakPoints.find((w) => w.tag === tag);
          if (existing) {
            existing.count++;
          } else {
            weakPoints.push({ tag, count: 1 });
          }
        }
      }
    }
    weakPoints.sort((a, b) => b.count - a.count);

    const themeMap = new Map<string, { total: number; mastered: number; due: number }>();
    for (const state of allStates) {
      const card = await this.getMotherCard(state.cardId);
      if (card) {
        const entry = themeMap.get(card.themeId) || { total: 0, mastered: 0, due: 0 };
        entry.total++;
        if (state.intervalDays >= 21) entry.mastered++;
        if (state.dueDate <= today) entry.due++;
        themeMap.set(card.themeId, entry);
      }
    }

    // Total reviewable cards = curated library + this user's own custom cards,
    // so progress stays consistent with due/mastered (which include custom cards).
    const profile = await this.getProfile(profileId);
    const curatedCount = await this.getMotherCardCount();
    const customCount = profile?.userId ? await this.getCustomCardCount(profile.userId) : 0;
    const totalCards = curatedCount + customCount;

    const weakCardCount = allStates.filter(s => s.isPriority || s.lapses >= 2).length;

    return {
      dueCards: dueStates.length,
      masteredCards: masteredStates.length,
      totalCards,
      totalSessions: sessionList.length,
      weakCards: weakCardCount,
      weakPoints: weakPoints.slice(0, 5),
      themeProgress: Array.from(themeMap.entries()).map(([themeId, data]) => ({
        themeId,
        ...data,
      })),
    };
  }

  async getDashboardAggregate(profileId: number): Promise<DashboardAggregate> {
    const today = new Date().toISOString().split("T")[0];
    const dayOf = (d: Date) => new Date(d).toISOString().split("T")[0];

    const sessions = await db
      .select()
      .from(trainingSessions)
      .where(eq(trainingSessions.profileId, profileId));

    const sessionIds = sessions.map((s) => s.id);
    let events: SessionEvent[] = [];
    if (sessionIds.length > 0) {
      events = await db
        .select()
        .from(sessionEvents)
        .where(inArray(sessionEvents.sessionId, sessionIds))
        .orderBy(asc(sessionEvents.createdAt));
    }

    const flashcards = events.filter((e) => e.eventType === "flashcard_attempt");
    const debriefs = events.filter((e) => e.eventType === "debrief");

    const ratingDist = { hard: 0, medium: 0, easy: 0 };
    for (const e of flashcards) {
      if (e.rating === "hard") ratingDist.hard++;
      else if (e.rating === "medium") ratingDist.medium++;
      else if (e.rating === "easy") ratingDist.easy++;
    }

    const scoreHistory: DashboardAggregate["scoreHistory"] = [];
    const sums = { clarity: 0, frame: 0, tone: 0, concision: 0 };
    let scored = 0;
    for (const e of debriefs) {
      const s = e.scores as
        | { clarity?: number; frame?: number; tone?: number; concision?: number }
        | null;
      if (s && (s.clarity != null || s.frame != null || s.tone != null || s.concision != null)) {
        const clarity = Math.round(s.clarity ?? 0);
        const frame = Math.round(s.frame ?? 0);
        const tone = Math.round(s.tone ?? 0);
        const concision = Math.round(s.concision ?? 0);
        const overall = Math.round((clarity + frame + tone + concision) / 4);
        scoreHistory.push({ date: dayOf(e.createdAt), clarity, frame, tone, concision, overall });
        sums.clarity += clarity;
        sums.frame += frame;
        sums.tone += tone;
        sums.concision += concision;
        scored++;
      }
    }
    const avgScores = scored > 0
      ? {
          clarity: Math.round(sums.clarity / scored),
          frame: Math.round(sums.frame / scored),
          tone: Math.round(sums.tone / scored),
          concision: Math.round(sums.concision / scored),
        }
      : null;

    const recentStrengths: string[] = [];
    const recentImprovements: string[] = [];
    for (let i = debriefs.length - 1; i >= 0; i--) {
      const e = debriefs[i];
      if (e.debriefStrengths) recentStrengths.push(...e.debriefStrengths);
      if (e.debriefImprovement) recentImprovements.push(e.debriefImprovement);
    }

    return {
      today: {
        cards: flashcards.filter((e) => dayOf(e.createdAt) === today).length,
        sessions: sessions.filter((s) => s.sessionDate === today).length,
        debriefs: debriefs.filter((e) => dayOf(e.createdAt) === today).length,
      },
      totals: { sessions: sessions.length, cards: flashcards.length, debriefs: debriefs.length },
      ratingDist,
      avgScores,
      scoreHistory,
      recentStrengths: recentStrengths.slice(0, 12),
      recentImprovements: recentImprovements.slice(0, 8),
    };
  }
}

export const storage = new DatabaseStorage();
