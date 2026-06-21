---
name: Stripe (Replit connector + stripe-replit-sync)
description: Non-obvious gotchas wiring the Replit Stripe connector and the stripe-replit-sync engine
---

# Replit Stripe connector credential shape
The connector's `/api/v2/connection?connector_names=stripe` settings expose:
`account_id`, `secret`, `publishable`, `mcp`, `claim_url`.

- The Stripe **API key is `settings.secret`** — NOT `secret_key`.
- There is **no `webhook_secret`** in the connector settings.

**Why:** the official stripe skill template reads `settings.secret_key` / `settings.webhook_secret`,
which silently fails ("missing secret key") against the real connector. Must read `settings.secret`.

**How to apply:** in `stripeClient.ts` `getStripeCredentials`, return `secretKey: settings.secret`.
For the webhook signing secret, leave it empty — we use managed webhooks (below).

# Managed webhooks => empty stripeWebhookSecret is correct
`StripeSync` config doc: `stripeWebhookSecret` is "Required if not using managed webhooks."
We DO use managed webhooks via `findOrCreateManagedWebhook(url)`, so the sync engine tracks the
signing secret itself. Passing `stripeWebhookSecret: ''` is expected and webhook verification still works.

# syncBackfill() does NOT sync products/prices
`stripeSync.syncBackfill()` (no params) completes and logs success but leaves
`stripe.products` / `stripe.prices` empty. `/api/stripe/plans` reads those tables, so plans came back `[]`.

**Fix:** call `await stripeSync.syncProducts()` and `await stripeSync.syncPrices()` explicitly
(then `syncBackfill()` for customers/subscriptions/etc.) on startup. The explicit methods return
`{synced: N}` and populate the schema. Future product/price changes also flow in via the webhook.

**How to apply:** keep these explicit sync calls in `initStripe()` so a fresh connect (or prod boot)
self-populates plans without a one-off script.
