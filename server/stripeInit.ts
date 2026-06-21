import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";

/**
 * Initialises the `stripe` schema and starts data sync on startup.
 * Order matters: run migrations (creates the stripe schema) -> create the managed
 * webhook -> backfill existing data. This throws if Stripe isn't connected; the
 * caller treats that as non-fatal so the app keeps running on the free tier.
 */
export async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe integration");
  }

  console.log("Initializing Stripe schema...");
  await runMigrations({ databaseUrl });
  console.log("Stripe schema ready");

  const stripeSync = await getStripeSync();

  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  if (domain) {
    console.log("Setting up managed Stripe webhook...");
    const webhookResult = await stripeSync.findOrCreateManagedWebhook(
      `https://${domain}/api/stripe/webhook`,
    );
    console.log("Webhook configured:", webhookResult?.url || "setup complete");
  } else {
    console.warn("REPLIT_DOMAINS not set; skipping managed webhook setup.");
  }

  console.log("Syncing Stripe data...");
  // syncBackfill() does NOT cover products/prices, so sync those explicitly --
  // /api/stripe/plans reads them from the stripe schema. Run the full backfill
  // (customers, subscriptions, etc.) afterwards. Fire-and-forget so a slow or
  // failing sync never blocks server startup.
  (async () => {
    await stripeSync.syncProducts();
    await stripeSync.syncPrices();
    await stripeSync.syncBackfill();
  })()
    .then(() => console.log("Stripe data synced"))
    .catch((err) => console.error("Error syncing Stripe data:", err));
}
