import Joi from 'joi';

/**
 * Stripe payments config
 */
export const stripeSchema = {
  STRIPE_API_VERSION: Joi.string().default('2026-01-28.clover'),
  STRIPE_BYOK_FEE_PERCENTAGE: Joi.number().default(5),
  STRIPE_BYOK_FREE_THRESHOLD: Joi.number().default(500),
  STRIPE_COUPON_CREDITS_PACKS_V2_ENTERPRISE: Joi.string().optional(),
  STRIPE_COUPON_CREDITS_PACKS_V2_PRO: Joi.string().optional(),
  STRIPE_MONTHLY_CREDITS: Joi.number().default(35_000),
  STRIPE_PAYG_CREDITS: Joi.number().default(1_000),
  STRIPE_PRICE_PAYG: Joi.string().required(),
  STRIPE_PRICE_SKILLS_PRO: Joi.string().optional(),
  STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY: Joi.string().optional(),
  STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: Joi.string().optional(),
  STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: Joi.string().optional(),
  STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: Joi.string().optional(),
  STRIPE_PUBLISHABLE_KEY: Joi.string().required(),
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SIGNING_SECRET: Joi.string().required(),
  STRIPE_YEARLY_CREDITS: Joi.number().default(500_000),
};
