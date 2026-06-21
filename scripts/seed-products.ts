import { getUncachableStripeClient } from './stripeClient';

/**
 * Creates the Bagou Premium product and its two prices in Stripe (EUR):
 *   - Premium Mensuel : 9,99 €/mois
 *   - Premium Annuel  : 59,99 €/an
 *
 * The 7-day free trial is applied at Checkout (subscription_data.trial_period_days),
 * not on the price, so it is intentionally not configured here.
 *
 * Idempotent: it looks the product up by its `bagou_plan` metadata marker before
 * creating anything, and only adds prices that don't already exist.
 *
 * Run with: npx tsx scripts/seed-products.ts
 */
const PRODUCT_MARKER = 'premium';
const PRODUCT_NAME = 'Bagou Premium';

async function ensurePrice(
  stripe: Awaited<ReturnType<typeof getUncachableStripeClient>>,
  productId: string,
  interval: 'month' | 'year',
  unitAmount: number,
  label: string,
) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const existing = prices.data.find(
    (p) => p.recurring?.interval === interval && p.currency === 'eur',
  );
  if (existing) {
    console.log(`Price ${label} already exists (${existing.id}). Skipping.`);
    return existing;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmount,
    currency: 'eur',
    recurring: { interval },
    metadata: { bagou_plan: PRODUCT_MARKER, bagou_interval: interval },
  });
  console.log(`Created price ${label}: ${price.id}`);
  return price;
}

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log('Creating Bagou Premium product and prices in Stripe...');

    const existingProducts = await stripe.products.search({
      query: `metadata['bagou_plan']:'${PRODUCT_MARKER}' AND active:'true'`,
    });

    let product = existingProducts.data[0];
    if (product) {
      console.log(`Bagou Premium product already exists (${product.id}).`);
    } else {
      product = await stripe.products.create({
        name: PRODUCT_NAME,
        description:
          "Accès illimité à Bagou : cartes d'entraînement et simulations vocales sans limite.",
        metadata: { bagou_plan: PRODUCT_MARKER },
      });
      console.log(`Created product: ${product.name} (${product.id})`);
    }

    await ensurePrice(stripe, product.id, 'month', 999, 'Mensuel 9,99 €/mois');
    await ensurePrice(stripe, product.id, 'year', 5999, 'Annuel 59,99 €/an');

    console.log('✓ Bagou Premium plans are set up.');
    console.log('Webhooks will sync this data to the stripe schema automatically.');
  } catch (error: any) {
    console.error('Error creating products:', error.message);
    process.exit(1);
  }
}

createProducts();
