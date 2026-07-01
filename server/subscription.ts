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
  // Next billing/renewal date for paying (Stripe) premium users; null otherwise.
  renewsAt: Date | null;
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
): Promise<{ status: string; currentPeriodEnd: number | null; trialEnd: number | null } | null> {
  try {
    const result = await db.execute(
      sql`SELECT status, current_period_end, trial_end
          FROM stripe.subscriptions
          WHERE customer = ${customerId}
            AND status IN ('active', 'trialing')
          ORDER BY created DESC NULLS LAST
          LIMIT 1`,
    );
    const row = result.rows[0] as
      | { status: string; current_period_end: number | null; trial_end: number | null }
      | undefined;
    if (!row) return null;
    return {
      status: row.status,
      currentPeriodEnd: row.current_period_end ?? null,
      trialEnd: row.trial_end ?? null,
    };
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
    return { tier: "free", source: "none", trialEndsAt: null, renewsAt: null, unlimited: false };
  }

  // Manual admin override, independent of Stripe.
  const overrideActive =
    !user.subscriptionExpiresAt || user.subscriptionExpiresAt.getTime() > Date.now();
  if (overrideActive) {
    if (user.subscriptionStatus === "active") {
      return { tier: "premium", source: "admin", trialEndsAt: null, renewsAt: null, unlimited: true };
    }
    if (user.subscriptionStatus === "trial") {
      return {
        tier: "trial",
        source: "admin",
        trialEndsAt: user.subscriptionExpiresAt ?? null,
        renewsAt: null,
        unlimited: true,
      };
    }
  }

  // Live Stripe status (source of truth for paying users).
  if (user.stripeCustomerId) {
    const sub = await getActiveStripeSubscription(user.stripeCustomerId);
    if (sub?.status === "active") {
      return {
        tier: "premium",
        source: "stripe",
        trialEndsAt: null,
        renewsAt: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000) : null,
        unlimited: true,
      };
    }
    if (sub?.status === "trialing") {
      // Prefer the explicit trial_end; fall back to current_period_end (which
      // coincides with the trial end for a trialing subscription).
      const endTs = sub.trialEnd ?? sub.currentPeriodEnd;
      return {
        tier: "trial",
        source: "stripe",
        trialEndsAt: endTs ? new Date(endTs * 1000) : null,
        renewsAt: null,
        unlimited: true,
      };
    }
  }

  return { tier: "free", source: "none", trialEndsAt: null, renewsAt: null, unlimited: false };
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

export interface SubscriptionStatus {
  tier: AccessTier;
  source: AccessSource;
  isPremium: boolean;
  trialEndsAt: string | null;
  renewsAt: string | null;
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
    renewsAt: access.renewsAt ? access.renewsAt.toISOString() : null,
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

const QUOTA_UNAVAILABLE_MESSAGE =
  "Service momentanément indisponible. Réessaie dans un instant.";

/**
 * Atomically reserves one quota slot for `userId`/`type` within the current
 * window, returning the new usage-event id, or null if the limit is reached.
 *
 * A per-user/per-type transaction advisory lock serializes concurrent requests
 * so parallel calls can't each pass a stale count and over-consume the quota.
 */
async function tryConsumeQuota(
  userId: string,
  type: UsageType,
  since: Date,
  limit: number,
): Promise<number | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`quota:${userId}:${type}`}))`);
    const countRes = await tx.execute(
      sql`SELECT count(*)::int AS c
          FROM usage_events
          WHERE user_id = ${userId} AND type = ${type} AND created_at >= ${since}`,
    );
    const used = (countRes.rows[0] as { c: number } | undefined)?.c ?? 0;
    if (used >= limit) return null;
    const ins = await tx.execute(
      sql`INSERT INTO usage_events (user_id, type) VALUES (${userId}, ${type}) RETURNING id`,
    );
    return (ins.rows[0] as { id: number }).id;
  });
}

/** Releases a previously reserved quota slot (e.g. the guarded call failed). */
async function releaseQuota(id: number): Promise<void> {
  await db.delete(usageEvents).where(eq(usageEvents.id, id));
}

/**
 * Express middleware factory guarding an AI-consuming endpoint. Must run AFTER
 * `isAuthenticated`. Premium/trial users pass unlimited; free users atomically
 * consume one quota slot up front and otherwise get a French 402. The slot is
 * rolled back if the guarded call doesn't complete successfully (non-2xx or the
 * client disconnects), so a failed AI call never burns the user's quota.
 *
 * Fails closed (503) if the access tier or quota count can't be determined, so a
 * quota-system error can't silently let free users bypass their limits.
 */
export function quotaGuard(type: UsageType) {
  return async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    const userId = req.user?.claims?.sub as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    let unlimited: boolean;
    try {
      unlimited = (await getEffectiveAccess(userId)).unlimited;
    } catch (error) {
      console.error("quotaGuard access lookup failed:", error);
      return res.status(503).json({ error: "quota_unavailable", message: QUOTA_UNAVAILABLE_MESSAGE });
    }

    if (unlimited) return next();

    const limit = type === "flashcard" ? FREE_DAILY_CARDS : FREE_WEEKLY_VOCAL;
    const since = type === "flashcard" ? startOfToday() : sevenDaysAgo();

    let reservedId: number | null;
    try {
      reservedId = await tryConsumeQuota(userId, type, since, limit);
    } catch (error) {
      console.error("quotaGuard consume failed:", error);
      return res.status(503).json({ error: "quota_unavailable", message: QUOTA_UNAVAILABLE_MESSAGE });
    }

    if (reservedId == null) {
      const { code, message } = QUOTA_MESSAGES[type];
      return res.status(402).json({ error: "quota_exceeded", code, message });
    }

    // Roll back the reserved slot unless the guarded call completed with a 2xx,
    // so failed requests / client aborts don't consume the user's quota.
    let settled = false;
    const rollback = () => {
      if (settled) return;
      settled = true;
      releaseQuota(reservedId!).catch((err) =>
        console.error("Failed to release quota slot:", err),
      );
    };
    res.on("finish", () => {
      if (settled) return;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        settled = true; // success: keep the reserved slot
        return;
      }
      rollback();
    });
    res.on("close", () => {
      // Client disconnected before the response finished -> treat as a failure.
      if (!res.writableEnded) rollback();
    });

    next();
  };
}
