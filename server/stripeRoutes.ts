import type { Express } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { users } from "@shared/schema";
import { authStorage, isAuthenticated } from "./replit_integrations/auth";
import { getUncachableStripeClient } from "./stripeClient";
import { getSubscriptionStatus } from "./subscription";

function publicBaseUrl(req: any): string {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) return `https://${domain}`;
  return `${req.protocol}://${req.get("host")}`;
}

async function ensureStripeCustomer(userId: string): Promise<string> {
  const user = await authStorage.getUser(userId);
  if (!user) throw new Error("User not found");
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = await getUncachableStripeClient();
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { userId: user.id },
  });
  await db
    .update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, user.id));
  return customer.id;
}

export function registerStripeRoutes(app: Express): void {
  // Effective access tier + current usage vs. quota.
  app.get("/api/subscription/status", isAuthenticated, async (req: any, res) => {
    try {
      const status = await getSubscriptionStatus(req.user.claims.sub);
      res.json(status);
    } catch (error) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({ error: "Failed to fetch subscription status" });
    }
  });

  // Available plans, read from the synced stripe schema (never a custom table).
  app.get("/api/stripe/plans", async (_req, res) => {
    try {
      const result = await db.execute(
        sql`SELECT pr.id           AS price_id,
                   pr.unit_amount  AS unit_amount,
                   pr.currency     AS currency,
                   pr.recurring->>'interval' AS interval,
                   p.name          AS product_name
            FROM stripe.prices pr
            JOIN stripe.products p ON p.id = pr.product
            WHERE p.active = true
              AND pr.active = true
              AND p.metadata->>'bagou_plan' = 'premium'
              AND pr.currency = 'eur'
              AND pr.recurring->>'interval' IN ('month', 'year')
            ORDER BY pr.unit_amount ASC`,
      );
      const plans = result.rows.map((r: any) => ({
        priceId: r.price_id,
        unitAmount: r.unit_amount,
        currency: r.currency,
        interval: r.interval,
        productName: r.product_name,
      }));
      res.json({ plans });
    } catch (error) {
      // stripe schema not ready yet (e.g. Stripe not connected / seed not run).
      console.error("Error fetching plans:", error);
      res.json({ plans: [] });
    }
  });

  // Start a Stripe Checkout session for a chosen plan, with the 7-day free trial.
  app.post("/api/stripe/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const { priceId } = req.body ?? {};
      if (!priceId || typeof priceId !== "string") {
        return res.status(400).json({ error: "priceId is required" });
      }

      // Only allow checking out an active Bagou Premium price from the synced
      // stripe schema, so a caller can't pass an arbitrary price id.
      const allowed = await db.execute(
        sql`SELECT 1
            FROM stripe.prices pr
            JOIN stripe.products p ON p.id = pr.product
            WHERE pr.id = ${priceId}
              AND pr.active = true
              AND p.active = true
              AND p.metadata->>'bagou_plan' = 'premium'
              AND pr.currency = 'eur'
              AND pr.recurring->>'interval' IN ('month', 'year')
            LIMIT 1`,
      );
      if (allowed.rows.length === 0) {
        return res.status(400).json({ error: "Offre invalide." });
      }

      const userId = req.user.claims.sub;
      const customerId = await ensureStripeCustomer(userId);
      const stripe = await getUncachableStripeClient();
      const baseUrl = publicBaseUrl(req);

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
          trial_period_days: 7,
          metadata: { userId },
        },
        success_url: `${baseUrl}/abonnement?success=1`,
        cancel_url: `${baseUrl}/abonnement?canceled=1`,
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error?.message || error);
      res.status(500).json({ error: "Impossible de démarrer le paiement." });
    }
  });

  // Open the Stripe customer portal to manage / cancel a subscription.
  app.post("/api/stripe/portal", isAuthenticated, async (req: any, res) => {
    try {
      const user = await authStorage.getUser(req.user.claims.sub);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "Aucun abonnement à gérer." });
      }
      const stripe = await getUncachableStripeClient();
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${publicBaseUrl(req)}/abonnement`,
      });
      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error?.message || error);
      res.status(500).json({ error: "Impossible d'ouvrir la gestion de l'abonnement." });
    }
  });
}
