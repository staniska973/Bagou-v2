import { db } from "./db";
import {
  userProfiles,
  motherCards,
  srsStates,
  scenarios,
  sessions,
  sessionEvents,
  type UserProfile,
  type InsertUserProfile,
  type MotherCard,
  type InsertMotherCard,
  type SrsState,
  type InsertSrsState,
  type Scenario,
  type InsertScenario,
  type Session,
  type InsertSession,
  type SessionEvent,
  type InsertSessionEvent,
} from "@shared/schema";
import { eq, and, lte, sql, desc, asc } from "drizzle-orm";

export interface IStorage {
  // Profiles
  getProfile(id: number): Promise<UserProfile | undefined>;
  createProfile(data: InsertUserProfile): Promise<UserProfile>;
  updateProfile(id: number, data: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;

  // Mother Cards
  getMotherCard(cardId: string): Promise<MotherCard | undefined>;
  getMotherCardsByPack(packId: string): Promise<MotherCard[]>;
  getMotherCardsByTheme(themeId: string, language: string): Promise<MotherCard[]>;
  getAllMotherCards(language: string): Promise<MotherCard[]>;
  createMotherCard(data: InsertMotherCard): Promise<MotherCard>;
  createMotherCards(data: InsertMotherCard[]): Promise<MotherCard[]>;

  // SRS States
  getSrsState(profileId: number, cardId: string): Promise<SrsState | undefined>;
  getDueCards(profileId: number, date: string): Promise<SrsState[]>;
  createSrsState(data: InsertSrsState): Promise<SrsState>;
  updateSrsState(id: number, data: Partial<InsertSrsState>): Promise<SrsState | undefined>;
  getOrCreateSrsState(profileId: number, cardId: string): Promise<SrsState>;

  // Scenarios
  getScenario(scenarioId: string): Promise<Scenario | undefined>;
  getScenariosByTheme(themeId: string, language: string): Promise<Scenario[]>;
  getRandomScenario(language: string, linkedCardIds?: string[]): Promise<Scenario | undefined>;
  createScenario(data: InsertScenario): Promise<Scenario>;

  // Sessions
  getSession(id: number): Promise<Session | undefined>;
  getSessionsByProfile(profileId: number): Promise<Session[]>;
  createSession(data: InsertSession): Promise<Session>;
  updateSession(id: number, data: Partial<InsertSession>): Promise<Session | undefined>;

  // Session Events
  createSessionEvent(data: InsertSessionEvent): Promise<SessionEvent>;
  getSessionEvents(sessionId: number): Promise<SessionEvent[]>;

  // Stats
  getStats(profileId: number): Promise<{
    dueCards: number;
    masteredCards: number;
    totalSessions: number;
    weakPoints: { tag: string; count: number }[];
  }>;
}

class DatabaseStorage implements IStorage {
  // Profiles
  async getProfile(id: number): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.id, id));
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

  // Mother Cards
  async getMotherCard(cardId: string): Promise<MotherCard | undefined> {
    const [card] = await db.select().from(motherCards).where(eq(motherCards.cardId, cardId));
    return card;
  }

  async getMotherCardsByPack(packId: string): Promise<MotherCard[]> {
    return db.select().from(motherCards).where(eq(motherCards.packId, packId));
  }

  async getMotherCardsByTheme(themeId: string, language: string): Promise<MotherCard[]> {
    return db
      .select()
      .from(motherCards)
      .where(and(eq(motherCards.themeId, themeId), eq(motherCards.language, language)));
  }

  async getAllMotherCards(language: string): Promise<MotherCard[]> {
    return db.select().from(motherCards).where(eq(motherCards.language, language));
  }

  async createMotherCard(data: InsertMotherCard): Promise<MotherCard> {
    const [card] = await db.insert(motherCards).values(data).returning();
    return card;
  }

  async createMotherCards(data: InsertMotherCard[]): Promise<MotherCard[]> {
    if (data.length === 0) return [];
    return db.insert(motherCards).values(data).returning();
  }

  // SRS States
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

  // Scenarios
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

  // Sessions
  async getSession(id: number): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session;
  }

  async getSessionsByProfile(profileId: number): Promise<Session[]> {
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.profileId, profileId))
      .orderBy(desc(sessions.createdAt));
  }

  async createSession(data: InsertSession): Promise<Session> {
    const [session] = await db.insert(sessions).values(data).returning();
    return session;
  }

  async updateSession(id: number, data: Partial<InsertSession>): Promise<Session | undefined> {
    const [session] = await db.update(sessions).set(data).where(eq(sessions.id, id)).returning();
    return session;
  }

  // Session Events
  async createSessionEvent(data: InsertSessionEvent): Promise<SessionEvent> {
    const [event] = await db.insert(sessionEvents).values(data).returning();
    return event;
  }

  async getSessionEvents(sessionId: number): Promise<SessionEvent[]> {
    return db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, sessionId));
  }

  // Stats
  async getStats(profileId: number): Promise<{
    dueCards: number;
    masteredCards: number;
    totalSessions: number;
    weakPoints: { tag: string; count: number }[];
  }> {
    const today = new Date().toISOString().split("T")[0];
    
    const dueStates = await db
      .select()
      .from(srsStates)
      .where(and(eq(srsStates.profileId, profileId), lte(srsStates.dueDate, today)));
    
    const masteredStates = await db
      .select()
      .from(srsStates)
      .where(and(eq(srsStates.profileId, profileId), sql`${srsStates.intervalDays} >= 21`));
    
    const sessionList = await db
      .select()
      .from(sessions)
      .where(eq(sessions.profileId, profileId));
    
    const lapsedStates = await db
      .select()
      .from(srsStates)
      .where(and(eq(srsStates.profileId, profileId), sql`${srsStates.lapses} >= 1`));
    
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

    return {
      dueCards: dueStates.length,
      masteredCards: masteredStates.length,
      totalSessions: sessionList.length,
      weakPoints: weakPoints.slice(0, 5),
    };
  }
}

export const storage = new DatabaseStorage();
