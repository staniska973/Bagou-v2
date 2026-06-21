import { sql } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "@shared/schema";

// Read model powering the admin "Clients" console. This is a reporting/projection
// layer over the app tables plus the READ-ONLY synced `stripe` schema. It never
// writes to the stripe schema. Tier derivation mirrors getEffectiveAccess in
// server/subscription.ts (admin override > live Stripe > free) but is batched to
// avoid an N+1 lookup across the whole user base.

export type ClientTier = "free" | "trial" | "premium";
export type ClientSource = "none" | "admin" | "stripe";
export type PlanInterval = "month" | "year";

export interface ClientActivity {
  cards: number;
  vocal: number;
  sessions: number;
  lastActiveAt: string | null;
}

export interface AdminClient {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  createdAt: string | null;
  tier: ClientTier;
  source: ClientSource;
  planLabel: string;
  interval: PlanInterval | null;
  // Renewal date for paid Premium, trial end for a trial, or override expiry.
  renewalOrTrialEnd: string | null;
  // Raw manual override stored on the user row (independent of Stripe).
  overrideStatus: string;
  overrideExpiresAt: string | null;
  activity: ClientActivity;
}

export interface SubscriptionHistoryEntry {
  id: string;
  status: string;
  interval: PlanInterval | null;
  unitAmount: number | null;
  currency: string | null;
  created: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  productName: string | null;
}

export interface UsageDayPoint {
  day: string;
  cards: number;
  vocal: number;
}

export interface ClientDetail {
  client: AdminClient;
  usageByDay: UsageDayPoint[];
  subscriptionHistory: SubscriptionHistoryEntry[];
}

export interface AdminClientKpis {
  totalUsers: number;
  activeSubscribers: number;
  trials: number;
  freeUsers: number;
  compOverrides: number;
  premiumMonthly: number;
  premiumYearly: number;
  mrrCents: number;
}

interface StripeSubInfo {
  status: string;
  interval: PlanInterval | null;
  unitAmount: number | null;
  currency: string | null;
  currentPeriodEnd: number | null;
  trialEnd: number | null;
}

function unixToIso(value: number | null | undefined): string | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Date(n * 1000).toISOString();
}

function toNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normInterval(value: unknown): PlanInterval | null {
  return value === "month" || value === "year" ? value : null;
}

/**
 * Loads the most relevant active/trialing Stripe subscription per customer from
 * the synced stripe schema, mirroring getEffectiveAccess in server/subscription.ts:
 * ANY active/trialing subscription counts (no currency/metadata filter) so the
 * admin console can't report a different tier than the access the user actually
 * has. Price info is LEFT JOINed purely for display + MRR (MRR itself is kept
 * EUR-only at the aggregation step). Returns an empty map (never throws) if the
 * stripe schema isn't present yet.
 */
async function loadActiveStripeSubs(): Promise<Map<string, StripeSubInfo>> {
  const map = new Map<string, StripeSubInfo>();
  try {
    const result = await db.execute(
      sql`SELECT DISTINCT ON (s.customer)
            s.customer AS customer,
            s.status AS status,
            s.current_period_end AS current_period_end,
            CASE WHEN jsonb_typeof(s.trial_end) = 'number'
                 THEN (s.trial_end #>> '{}')::bigint END AS trial_end,
            pr.unit_amount AS unit_amount,
            pr.currency AS currency,
            pr.recurring->>'interval' AS interval
          FROM stripe.subscriptions s
          LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
          LEFT JOIN stripe.prices pr ON pr.id = si.price
          WHERE s.status IN ('active', 'trialing')
          ORDER BY s.customer, s.created DESC NULLS LAST`,
    );
    for (const row of result.rows as any[]) {
      if (!row.customer) continue;
      map.set(row.customer as string, {
        status: row.status as string,
        interval: normInterval(row.interval),
        unitAmount: toNum(row.unit_amount),
        currency: (row.currency as string) ?? null,
        currentPeriodEnd: toNum(row.current_period_end),
        trialEnd: toNum(row.trial_end),
      });
    }
  } catch {
    // stripe schema not present / Stripe not connected yet.
  }
  return map;
}

interface UsageAgg {
  cards: number;
  vocal: number;
  lastUsageAt: number | null;
}

async function loadUsageAgg(): Promise<Map<string, UsageAgg>> {
  const map = new Map<string, UsageAgg>();
  const result = await db.execute(
    sql`SELECT user_id,
               COUNT(*) FILTER (WHERE type = 'flashcard')::int AS cards,
               COUNT(*) FILTER (WHERE type = 'vocal_session')::int AS vocal,
               EXTRACT(EPOCH FROM MAX(created_at))::bigint AS last_at
        FROM usage_events
        GROUP BY user_id`,
  );
  for (const row of result.rows as any[]) {
    map.set(row.user_id as string, {
      cards: Number(row.cards) || 0,
      vocal: Number(row.vocal) || 0,
      lastUsageAt: toNum(row.last_at),
    });
  }
  return map;
}

interface SessionAgg {
  sessions: number;
  lastSessionAt: number | null;
}

async function loadSessionAgg(): Promise<Map<string, SessionAgg>> {
  const map = new Map<string, SessionAgg>();
  const result = await db.execute(
    sql`SELECT up.user_id AS user_id,
               COUNT(*)::int AS sessions,
               EXTRACT(EPOCH FROM MAX(ts.created_at))::bigint AS last_at
        FROM training_sessions ts
        JOIN user_profiles up ON up.id = ts.profile_id
        WHERE up.user_id IS NOT NULL
        GROUP BY up.user_id`,
  );
  for (const row of result.rows as any[]) {
    map.set(row.user_id as string, {
      sessions: Number(row.sessions) || 0,
      lastSessionAt: toNum(row.last_at),
    });
  }
  return map;
}

interface EnrichedClient {
  client: AdminClient;
  unitAmount: number | null;
  currency: string | null;
}

function deriveClient(
  user: User,
  sub: StripeSubInfo | undefined,
  usage: UsageAgg | undefined,
  session: SessionAgg | undefined,
): EnrichedClient {
  const now = Date.now();
  const overrideStatus = user.subscriptionStatus || "none";
  const overrideExpiresAt = user.subscriptionExpiresAt ?? null;
  const overrideActive = !overrideExpiresAt || overrideExpiresAt.getTime() > now;

  let tier: ClientTier = "free";
  let source: ClientSource = "none";
  let planLabel = "Gratuit";
  let interval: PlanInterval | null = null;
  let renewalOrTrialEnd: string | null = null;
  let unitAmount: number | null = null;
  let currency: string | null = null;

  if (overrideActive && overrideStatus === "active") {
    tier = "premium";
    source = "admin";
    planLabel = "Premium (offert)";
    renewalOrTrialEnd = overrideExpiresAt ? overrideExpiresAt.toISOString() : null;
  } else if (overrideActive && overrideStatus === "trial") {
    tier = "trial";
    source = "admin";
    planLabel = "Essai (offert)";
    renewalOrTrialEnd = overrideExpiresAt ? overrideExpiresAt.toISOString() : null;
  } else if (sub?.status === "active") {
    tier = "premium";
    source = "stripe";
    interval = sub.interval;
    unitAmount = sub.unitAmount;
    currency = sub.currency;
    planLabel =
      interval === "month"
        ? "Premium mensuel"
        : interval === "year"
          ? "Premium annuel"
          : "Premium";
    renewalOrTrialEnd = unixToIso(sub.currentPeriodEnd);
  } else if (sub?.status === "trialing") {
    tier = "trial";
    source = "stripe";
    interval = sub.interval;
    planLabel = "Essai";
    renewalOrTrialEnd = unixToIso(sub.trialEnd ?? sub.currentPeriodEnd);
  }

  const lastUsageAt = usage?.lastUsageAt ?? null;
  const lastSessionAt = session?.lastSessionAt ?? null;
  const lastEpoch =
    lastUsageAt != null && lastSessionAt != null
      ? Math.max(lastUsageAt, lastSessionAt)
      : (lastUsageAt ?? lastSessionAt);

  return {
    unitAmount,
    currency,
    client: {
      id: user.id,
      email: user.email ?? null,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      tier,
      source,
      planLabel,
      interval,
      renewalOrTrialEnd,
      overrideStatus,
      overrideExpiresAt: overrideExpiresAt ? overrideExpiresAt.toISOString() : null,
      activity: {
        cards: usage?.cards ?? 0,
        vocal: usage?.vocal ?? 0,
        sessions: session?.sessions ?? 0,
        lastActiveAt: unixToIso(lastEpoch ?? null),
      },
    },
  };
}

async function computeEnrichedClients(): Promise<EnrichedClient[]> {
  const [allUsers, stripeSubs, usageAgg, sessionAgg] = await Promise.all([
    db.select().from(users),
    loadActiveStripeSubs(),
    loadUsageAgg(),
    loadSessionAgg(),
  ]);

  return allUsers
    .map((user) =>
      deriveClient(
        user,
        user.stripeCustomerId ? stripeSubs.get(user.stripeCustomerId) : undefined,
        usageAgg.get(user.id),
        sessionAgg.get(user.id),
      ),
    )
    .sort((a, b) => {
      const at = a.client.createdAt ? Date.parse(a.client.createdAt) : 0;
      const bt = b.client.createdAt ? Date.parse(b.client.createdAt) : 0;
      return bt - at;
    });
}

export async function listClients(): Promise<AdminClient[]> {
  const enriched = await computeEnrichedClients();
  return enriched.map((e) => e.client);
}

export async function getKpis(): Promise<AdminClientKpis> {
  const enriched = await computeEnrichedClients();

  let activeSubscribers = 0;
  let trials = 0;
  let freeUsers = 0;
  let compOverrides = 0;
  let premiumMonthly = 0;
  let premiumYearly = 0;
  let mrrCents = 0;

  for (const { client, unitAmount, currency } of enriched) {
    if (client.tier === "premium" && client.source === "stripe") {
      activeSubscribers++;
      // MRR is reported in EUR; only EUR-priced plans contribute an amount, but
      // the subscriber is still counted (mirrors getEffectiveAccess).
      const amt = currency === "eur" ? (unitAmount ?? 0) : 0;
      if (client.interval === "month") {
        premiumMonthly++;
        mrrCents += amt;
      } else if (client.interval === "year") {
        premiumYearly++;
        mrrCents += Math.round(amt / 12);
      } else {
        mrrCents += amt;
      }
    } else if (client.tier === "premium" && client.source === "admin") {
      compOverrides++;
    } else if (client.tier === "trial") {
      trials++;
    } else {
      freeUsers++;
    }
  }

  return {
    totalUsers: enriched.length,
    activeSubscribers,
    trials,
    freeUsers,
    compOverrides,
    premiumMonthly,
    premiumYearly,
    mrrCents,
  };
}

async function loadUsageByDay(userId: string): Promise<UsageDayPoint[]> {
  const result = await db.execute(
    sql`SELECT to_char(created_at, 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE type = 'flashcard')::int AS cards,
               COUNT(*) FILTER (WHERE type = 'vocal_session')::int AS vocal
        FROM usage_events
        WHERE user_id = ${userId}
          AND created_at >= now() - interval '30 days'
        GROUP BY day
        ORDER BY day ASC`,
  );
  return (result.rows as any[]).map((row) => ({
    day: row.day as string,
    cards: Number(row.cards) || 0,
    vocal: Number(row.vocal) || 0,
  }));
}

async function loadSubscriptionHistory(
  customerId: string,
): Promise<SubscriptionHistoryEntry[]> {
  try {
    const result = await db.execute(
      sql`SELECT s.id AS id,
                 s.status AS status,
                 s.current_period_end AS current_period_end,
                 CASE WHEN jsonb_typeof(s.trial_end) = 'number'
                      THEN (s.trial_end #>> '{}')::bigint END AS trial_end,
                 s.created AS created,
                 s.cancel_at_period_end AS cancel_at_period_end,
                 s.canceled_at AS canceled_at,
                 s.ended_at AS ended_at,
                 pr.unit_amount AS unit_amount,
                 pr.currency AS currency,
                 pr.recurring->>'interval' AS interval,
                 p.name AS product_name
          FROM stripe.subscriptions s
          LEFT JOIN stripe.subscription_items si ON si.subscription = s.id
          LEFT JOIN stripe.prices pr ON pr.id = si.price
          LEFT JOIN stripe.products p ON p.id = pr.product
          WHERE s.customer = ${customerId}
          ORDER BY s.created DESC NULLS LAST`,
    );
    return (result.rows as any[]).map((row) => ({
      id: row.id as string,
      status: row.status as string,
      interval: normInterval(row.interval),
      unitAmount: toNum(row.unit_amount),
      currency: (row.currency as string) ?? null,
      created: unixToIso(toNum(row.created)),
      currentPeriodEnd: unixToIso(toNum(row.current_period_end)),
      trialEnd: unixToIso(toNum(row.trial_end)),
      cancelAtPeriodEnd: row.cancel_at_period_end === true,
      canceledAt: unixToIso(toNum(row.canceled_at)),
      endedAt: unixToIso(toNum(row.ended_at)),
      productName: (row.product_name as string) ?? null,
    }));
  } catch {
    return [];
  }
}

export async function getClientDetail(userId: string): Promise<ClientDetail | null> {
  const [user] = await db.select().from(users).where(sql`${users.id} = ${userId}`);
  if (!user) return null;

  const [stripeSubs, usageAgg, sessionAgg] = await Promise.all([
    loadActiveStripeSubs(),
    loadUsageAgg(),
    loadSessionAgg(),
  ]);

  const { client } = deriveClient(
    user,
    user.stripeCustomerId ? stripeSubs.get(user.stripeCustomerId) : undefined,
    usageAgg.get(user.id),
    sessionAgg.get(user.id),
  );

  const [usageByDay, subscriptionHistory] = await Promise.all([
    loadUsageByDay(userId),
    user.stripeCustomerId ? loadSubscriptionHistory(user.stripeCustomerId) : Promise.resolve([]),
  ]);

  return { client, usageByDay, subscriptionHistory };
}
