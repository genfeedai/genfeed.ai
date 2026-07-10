/**
 * @genfeedai/pricing — Single source of truth for ALL pricing in genfeed.ai.
 *
 * This package owns: provider costs, credit costs, plans, credit packs,
 * BYOK fees, margins, and pricing configuration.
 *
 * To change a price, edit the files in this package:
 *   - provider-pricing.ts  — AI provider costs, model types, node-type sets, UI option arrays
 *   - plans-pricing.ts     — BYOK constants, credit costs, website plans, credit packs, services
 *   - pricing-config.ts    — PricingConfig re-export + getPricingConfig env reader
 *
 * Propagation is verified by:
 *   packages/pricing/src/provider-pricing.spec.ts
 *   packages/helpers/src/business/pricing/pricing.helper.test.ts
 *
 * Downstream Joi env defaults in packages/config/src/schemas/stripe.schema.ts
 * consume BYOK_FEE_PERCENTAGE and BYOK_FREE_THRESHOLD_CREDITS from this package.
 */

export * from './plans-pricing';
export * from './pricing-config';
export * from './provider-pricing';
export * from './tier-entitlements';
