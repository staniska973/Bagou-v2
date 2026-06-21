import type { Request, Response, NextFunction } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { users, usageEvents, type UsageType } from "@shared/schema";

// Free-tier quotas. Premium/trial users are unlimited.
export const FREE_DAILY_CARDS = 3;
export const FREE_WEEKLY_VOCAL = 1;

export type AccessTier = "free" | "trial" | "premium";
export type AccessSource = "stripe" | "admin" | "none";

export interface EffectiveAccess {
  tier: AccessTier;
  source: AccessSource;
  trialEndsAt: Date | null;
  // true for trial and premium — i.e. no quotas apply.
  unlimited: boolean;
}

/**
 * Reads the user's live Stripe subscription from the synced `stripe` schema.
 * Returns the most relevant active/trialing subscription, or null. Never throws:
 * if the stripe schema isn't ready yet (Stripe not connected), we fall back to
 * the free/admin-override tier.
 */
async function getActiveStripeSubscription(
  customerId: string,
): Promise<{ status: string; currentPeriodEnd: number | null } | null> {
  try {
    const result = await db.execute(
      sql`SELECT status, current_period_end
          FROM stripe.subscriptions
          WHERE customer = ${customerId}
            AND status IN ('active', 'trialing')
          ORDER BY created DESC NULLS LAST
          LIMIT 1`,
    );
    const row = result.rows[0] as
      | { status: string; current_period_end: number | null }
      | undefined;
    if (!row) return null;
    return { status: row.status, currentPeriodEnd: row.current_period_end ?? null };
  } catch {
    // stripe schema not present / Stripe not connected yet.
    return null;
  }
}

/**
 * Derives the user's effective access tier.
 * Priority: manual admin override (comp/grant) → live Stripe subscription → free.
 */
export async function getEffectiveAccess(userId: string): Promise<EffectiveAccess> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return { tier: "free", source: "none", trialEndsAt: null, unlimited: false };
  }

  // Manual admin override, independent of Stripe.
  const overrideActive =
    !user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() > Date.now();
  if (overrideActive) {
    if (user.subscriptionStatus === "active") {
      return { tier: "premium", source: "admin", trialEndsAt: null, unlimited: true };
    }
    if (user.subscriptionStatus === "trial") {
      return {
        tier: "trial",
        source: "admin",
        trialEndsAt: user.subscriptionExpiresAt ?? null,
        unlimited: true,
      };
    }
  }

  // Live Stripe status (source of truth for paying users).
  if (user.stripeCustomerId) {
    const sub = await getActiveStripeSubscription(user.stripeCustomerId);
    if (sub?.status === "active") {
      return { tier: "premium", source: "stripe", trialEndsAt: null, unlimited: true };
    }
    if (sub?.status === "trialing") {
      return {
        tier: "trial",
        source: "stripe",
        // For a trialing subscription the current period ends when the trial ends.
        trialEndsAt: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : null,
        unlimited: true,
      };
    }
  }

  return { tier: "free", source: "none", trialEndsAt: null, unlimited: false };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function sevenDaysAgo(): Date {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function countUsage(userId: string, type: UsageType, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.type, type),
        gte(usageEvents.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function getDailyFlashcardCount(userId: string): Promise<number> {
  return countUsage(userId, "flashcard", startOfToday());
}

export async function getWeeklyVocalCount(userId: string): Promise<number> {
  return countUsage(userId, "vocal_session", sevenDaysAgo());
}

export async function recordUsage(userId: string, type: UsageType): Promise<void> {
  await db.insert(usageEvents).values({ userId, type });
}

export interface SubscriptionStatus {
  tier: AccessTier;
  source: AccessSource;
  isPremium: boolean;
  trialEndsAt: string | null;
  usage: {
    cards: { used: number; limit: number | null };
    vocal: { used: number; limit: number | null };
  };
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const access = await getEffectiveAccess(userId);
  const [cardsUsed, vocalUsed] = await Promise.all([
    getDailyFlashcardCount(userId),
    getWeeklyVocalCount(userId),
  ]);

  return {
    tier: access.tier,
    source: access.source,
    isPremium: access.unlimited,
    trialEndsAt: access.trialEndsAt ? access.trialEndsAt.toISOString() : null,
    usage: {
      cards: { used: cardsUsed, limit: access.unlimited ? null : FREE_DAILY_CARDS },
      vocal: { used: vocalUsed, limit: access.unlimited ? null : FREE_WEEKLY_VOCAL },
    },
  };
}

const QUOTA_MESSAGES: Record<UsageType, { code: string; message: string }> = {
  flashcard: {
    code: "QUOTA_FLASHCARD",
    message:
      "Tu as atteint ta limite de 3 cartes gratuites aujourd'hui. Passe en Premium pour t'entraîner sans limite.",
  },
  vocal_session: {
    code: "QUOTA_VOCAL",
    message:
      "Tu as déjà utilisé ta simulation vocale gratuite cette semaine. Passe en Premium pour t'entraîner sans limite.",
  },
};

/**
 * Express middleware factory guarding an AI-consuming endpoint. Must run AFTER
 * `isAuthenticated`. Premium/trial users pass unlimited; free users are checked
 * against the daily-card / weekly-vocal quota and otherwise get a French 402.
 * A usage event is recorded once the response completes successfully (2xx).
 */
export function quotaGuard(type: UsageType) {
  return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.claims?.sub as string | undefined;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const access = await getEffectiveAccess(userId);

      if (!access.unlimited) {
        const used =
          type === "flashcard"
            ? await getDailyFlashcardCount(userId)
            : await getWeeklyVocalCount(userId);
        const limit = type === "flashcard" ? FREE_DAILY_CARDS : FREE_WEEKLY_VOCAL;
        if (used >= limit) {
          const { code, message } = QUOTA_MESSAGES[type];
          return res.status(402).json({ error: "quota_exceeded", code, message });
        }
      }

      // Record the action only once it succeeds, so a failed AI call doesn't
      // consume the user's quota.
      let recorded = false;
      res.on("finish", () => {
        if (recorded) return;
        recorded = true;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          recordUsage(userId, type).catch((err) =>
            console.error("Failed to record usage event:", err),
          );
        }
      });

      next();
    } catch (error) {
      console.error("quotaGuard error:", error);
      // Fail open so a quota-system hiccup never blocks paying users.
      next();
    }
  };
}
