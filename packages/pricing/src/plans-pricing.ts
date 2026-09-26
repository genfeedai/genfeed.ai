/**
 * Genfeed.ai Pricing Configuration
 *
 * Canonical source for plan, credit, and BYOK pricing.
 * See: https://github.com/genfeedai/genfeed.ai/issues/486
 *
 * Pricing Strategy:
 * - Credits are the user-facing unit of output: 1 credit = $0.01 PAYG.
 * - Pay As You Go is free to join: buy credit packs, spend on any output
 * - Subscriptions sell a better credit rate, not access: included monthly
 *   credits carry a ~20% bonus over the pay-as-you-go rate (Pro $49 → 5,900
 *   credits ≈ $59 of PAYG output; Scale $499 → 60,000 credits ≈ $600).
 * - Seats are never a usage meter: FREE/BYOK is solo (1 seat); every paid tier
 *   (Pro, Scale, Enterprise) has unlimited seats. Multi-organization workflows
 *   start at Scale. Brands and connected channels are unlimited so credits stay
 *   the only output meter (account-sharing can't dodge a usage meter).
 * - Models are never user-selected: the Genfeed router picks the best model
 *   for each format, brief, and budget
 *
 * @updated 2026-07-06
 */

import type {
  CreditPackTier,
  ServiceOfferingProps,
  TrainingPackageProps,
} from '@genfeedai/contracts/interfaces';

export type { CreditPackTier, ServiceOfferingProps, TrainingPackageProps };

interface PricingOutputsProps {
  /** Video generation in minutes per month */
  videoMinutes?: number;
  /** Number of images per month */
  images?: number;
  /** Voice generation in minutes per month */
  voiceMinutes?: number;
}

/**
 * Stable plan identifier. Every consumer (copy, data files, UI, structured
 * data) references a plan by tier and resolves the display name through
 * PLAN_LABELS. Nothing outside this file spells a plan name, so renaming a
 * plan is a one-line change here instead of a site-wide find-and-replace.
 */
export type PlanTier = 'payg' | 'pro' | 'scale' | 'enterprise';

/**
 * Canonical display label per tier: the only place a plan name is written.
 */
export const PLAN_LABELS = {
  enterprise: 'Enterprise',
  payg: 'Pay As You Go',
  pro: 'Pro',
  scale: 'Scale',
} as const satisfies Record<PlanTier, string>;

export interface PricingPlanProps {
  /** Display label (e.g., "Pro", "Scale", "Enterprise") */
  label: string;
  /** Stripe price ID for checkout */
  stripePriceId?: string;
  /** Plan type */
  type: 'subscription' | 'payg' | 'self-hosted' | 'enterprise' | 'byok';
  /** Short description */
  description: string;
  /** Billing interval */
  interval: 'month' | 'year' | 'payg';
  /** Credits included every month (subscriptions only) */
  includedCredits?: number | null;
  /** Feature list for pricing card */
  features: string[];
  /** Monthly price in USD (null for contact sales) */
  price: number | null;
  /** Output quotas (videos, images, voice) - user-facing */
  outputs?: PricingOutputsProps | null;
  /** CTA button text */
  cta?: string;
  /** CTA button link */
  ctaHref?: string;
  /** Target audience description */
  target?: string;
  /** Value proposition one-liner */
  valueProposition?: string;
  /** Discounted monthly price shown alongside the standard price (launch pricing) */
  launchPrice?: number;
  /** Explanatory note shown under launch pricing (e.g. duration/terms) */
  launchNote?: string;
}

/**
 * A plan on the public pricing page. Carries the stable `tier` discriminant so
 * consumers never have to match on the display label.
 */
export interface WebsitePlanProps extends PricingPlanProps {
  tier: PlanTier;
}

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const STRIPE_PRICE_IDS = {
  enterprise:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY,
  // Convenience aliases
  monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY,
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY,
  scale: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY,
} as const;

/** Monthly USD price per tier (null = contact sales). */
const PLAN_PRICES = {
  enterprise: null,
  payg: 0,
  pro: 49,
  scale: 499,
} as const satisfies Record<PlanTier, number | null>;

/**
 * Monthly included credits per paid subscription tier.
 *
 * Published fallback only. The authoritative grant for a live subscription is
 * the `included_monthly_credits` metadata on its Stripe price, so operators and
 * self-hosted deployments can price without a code change. These values are used
 * when a price carries no metadata but its tier is known.
 *
 * Each tier includes a credit bonus over the $0.01 PAYG rate.
 */
export const TIER_INCLUDED_MONTHLY_CREDITS: Record<string, number> = {
  pro: 5_900,
  scale: 60_000,
};

export type SubscriptionPriceTier = 'pro' | 'scale';

/**
 * Stable Stripe price contracts keyed by Genfeed tier, never by Stripe product
 * display name. The live catalog historically called the Pro product
 * "Creator", so display-name validation would reject the correct price while
 * accepting a renamed wrong one.
 */
export const SUBSCRIPTION_PRICE_CONTRACTS = {
  pro: {
    currency: 'usd',
    includedMonthlyCredits: TIER_INCLUDED_MONTHLY_CREDITS.pro,
    interval: 'month',
    unitAmount: PLAN_PRICES.pro * 100,
  },
  scale: {
    currency: 'usd',
    includedMonthlyCredits: TIER_INCLUDED_MONTHLY_CREDITS.scale,
    interval: 'month',
    unitAmount: PLAN_PRICES.scale * 100,
  },
} as const satisfies Record<
  SubscriptionPriceTier,
  {
    currency: string;
    includedMonthlyCredits: number;
    interval: 'month';
    unitAmount: number;
  }
>;

/**
 * Metadata key on a Stripe price that carries its monthly credit grant.
 *
 * This is the authoritative source: whoever owns the Stripe account decides how
 * many credits a price includes, and a self-hosted operator can reprice without
 * touching code or redeploying. Set it on every recurring price, e.g.
 * `stripe prices update price_xxx --metadata included_monthly_credits=5900`.
 */
export const INCLUDED_MONTHLY_CREDITS_METADATA_KEY = 'included_monthly_credits';

/**
 * Reads a credit grant out of Stripe price metadata, which is always a string
 * map and may hold anything an operator typed. Returns null for anything that
 * is not a positive whole number, so callers fail closed on a typo instead of
 * granting `NaN` or a negative balance.
 */
export function parseIncludedMonthlyCredits(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

/**
 * BYOK Platform Fee Configuration
 * 5% fee on BYOK usage after a free monthly threshold.
 * Exchange rate: 1 credit = $0.01
 */
export const BYOK_FEE_PERCENTAGE = 5;
export const BYOK_FREE_THRESHOLD_CREDITS = 500;
export const BYOK_CREDIT_VALUE_DOLLARS = 0.01;
export const BASE_PROVIDER_COST_FRACTION = 0.3;
export const BASE_MARGIN_PERCENT = 70;
/**
 * Sell price = provider cost × this multiplier, for **generation** billing
 * (`applyMargin`). 3.33 = 70% margin on sell price (1/0.30, the pre-#5172
 * base markup baked into the default so removing the hidden `/ 0.30` in
 * `applyMargin` did not move a single price). Agent chat carries its own
 * default — see `AGENT_CREDIT_MARGIN_MULTIPLIER` in
 * `@genfeedai/contracts/constants` and `DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER`
 * in `./agent-chat-margin`.
 */
export const DEFAULT_GENERATION_MARGIN_MULTIPLIER = 3.33;
/** Shared operator safety cap for every stored margin multiplier. */
export const MAX_MARGIN_MULTIPLIER = 10;
export const BYOK_FEE_PER_CREDIT =
  BYOK_CREDIT_VALUE_DOLLARS * (BYOK_FEE_PERCENTAGE / 100);

function formatPricingNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Process-scoped **generation** margin multiplier: sell price = provider
 * cost × multiplier. Hydrated from the
 * `PlatformSetting.marginMultiplierGeneration` operator knob at runtime (API
 * on boot/update, workers per model-discovery run) so that every
 * `applyMargin` call site in a process stays consistent without threading the
 * value through their signatures. Agent chat is billed from its own separate
 * runtime multiplier — see `./agent-chat-margin` — so this value never
 * affects agent chat credits.
 */
let runtimeGenerationMarginMultiplier = DEFAULT_GENERATION_MARGIN_MULTIPLIER;

/** Normalize a candidate multiplier, falling back to `fallback` when invalid. */
export function normalizeMarginMultiplier(
  multiplier: number,
  fallback: number,
): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return fallback;
  }

  return Math.min(multiplier, MAX_MARGIN_MULTIPLIER);
}

/**
 * Set the process-scoped generation margin multiplier. Non-finite or
 * non-positive values fall back to the default so a misconfigured knob can
 * never zero out pricing.
 */
export function setRuntimeMarginMultiplier(multiplier: number): void {
  runtimeGenerationMarginMultiplier = normalizeMarginMultiplier(
    multiplier,
    DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  );
}

/** Read the current process-scoped generation margin multiplier. */
export function getRuntimeMarginMultiplier(): number {
  return runtimeGenerationMarginMultiplier;
}

/**
 * Apply the operator-configured **generation** margin multiplier to provider
 * cost and return the sell price in credits (1 credit = $0.01).
 *
 * Formula: Sell Price (USD) = providerCostUsd * marginMultiplier
 * Credits = Sell Price / BYOK_CREDIT_VALUE_DOLLARS
 *
 * @param providerCostUsd Raw provider cost in USD.
 * @param marginMultiplier Sell/cost ratio configured by platform operators in
 *   /admin (see PlatformSetting.marginMultiplierGeneration). 1.0 = provider
 *   cost, 3.33 = 70% margin on sell price. Defaults to the process-scoped
 *   runtime multiplier (see setRuntimeMarginMultiplier). Non-finite or
 *   non-positive values fall back to the default so a misconfigured knob can
 *   never zero out pricing.
 * @example applyMargin(0.15) → 50 credits ($0.4995 sell price on $0.15 cost)
 * @example applyMargin(0.50) → 167 credits ($1.665 sell price on $0.50 cost)
 * @example applyMargin(0.15, 1.2) → 18 credits ($0.18 sell price)
 */
export function applyMargin(
  providerCostUsd: number,
  marginMultiplier: number = runtimeGenerationMarginMultiplier,
): number {
  const safeMultiplier = normalizeMarginMultiplier(
    marginMultiplier,
    DEFAULT_GENERATION_MARGIN_MULTIPLIER,
  );
  const sellPriceUsd = providerCostUsd * safeMultiplier;
  const credits = Math.ceil(sellPriceUsd / BYOK_CREDIT_VALUE_DOLLARS);
  return Math.max(credits, 2); // absolute minimum floor
}

/**
 * Internal credit costs (hidden from users)
 * Used for margin tracking and cost accounting only
 *
 * Exchange rate: 1 credit = $0.01
 *
 * See: https://github.com/genfeedai/genfeed.ai/issues?q=is%3Aissue+pricing
 */
export const INTERNAL_CREDIT_COSTS = {
  /** Long-form article: 25 credits = $0.25 */
  articlePerPost: 25,
  /** Avatar/Lip-sync per second: 100 credits = $1.00/sec */
  avatarPerSecond: 100,
  /** Image (1K/2K): 50 credits = $0.50 */
  image: 50,
  /** Image (4K): 100 credits = $1.00 */
  image4k: 100,
  /** Video per second: 75 credits = $0.75/sec */
  videoPerSecond: 75,
  /** Voice per minute: 17 credits = $0.17 */
  voicePerMinute: 17,
} as const;

/**
 * Video duration helpers
 * Standard video durations and their credit costs
 */
export const VIDEO_CREDIT_COSTS = {
  /** 4 second video: 300 credits = $3.00 */
  video4s: INTERNAL_CREDIT_COSTS.videoPerSecond * 4,
  /** 8 second video: 600 credits = $6.00 */
  video8s: INTERNAL_CREDIT_COSTS.videoPerSecond * 8,
  /** 15 second video: 1125 credits = $11.25 */
  video15s: INTERNAL_CREDIT_COSTS.videoPerSecond * 15,
} as const;

/**
 * Avatar duration helpers
 * Standard avatar durations and their credit costs
 */
export const AVATAR_CREDIT_COSTS = {
  /** 4 second avatar: 400 credits = $4.00 */
  avatar4s: INTERNAL_CREDIT_COSTS.avatarPerSecond * 4,
  /** 8 second avatar: 800 credits = $8.00 */
  avatar8s: INTERNAL_CREDIT_COSTS.avatarPerSecond * 8,
  /** 15 second avatar: 1500 credits = $15.00 */
  avatar15s: INTERNAL_CREDIT_COSTS.avatarPerSecond * 15,
} as const;

/**
 * Feature bullet describing a subscription's monthly credit grant, derived from
 * TIER_INCLUDED_MONTHLY_CREDITS so the number in the copy can never drift from
 * the number actually granted.
 */
function includedCreditsFeature(tier: 'pro' | 'scale'): string {
  const credits = TIER_INCLUDED_MONTHLY_CREDITS[tier];
  const paygValue = credits * BYOK_CREDIT_VALUE_DOLLARS;

  return `${formatPricingNumber(credits)} credits included monthly (≈ $${formatPricingNumber(paygValue)} of pay-as-you-go output)`;
}

/**
 * Website pricing plans - displayed on public pricing page
 * Free-to-join PAYG credits, subscriptions with included credits, B2B cloud
 */
export const websitePlans: WebsitePlanProps[] = [
  // Pay As You Go Tier - free account, credits only ($0/month)
  {
    cta: 'Start Free',
    ctaHref: `${process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT || 'https://app.genfeed.ai'}/sign-up?plan=payg`,
    description: 'Free account with pay-per-output credits',
    // The first five bullets are the comparison axis rendered on the pricing
    // card and are deliberately parallel across every tier: credits, seats,
    // organizations, brands and channels, API. Tier-specific extras follow.
    features: [
      'Credits at the standard rate (1 credit = $0.01)',
      '1 seat',
      '1 organization',
      'Unlimited brands and connected channels',
      'App access only (no API)',
      'Best model auto-routed for every job',
      'Multi-platform publishing',
      'Email support',
    ],
    interval: 'payg',
    label: PLAN_LABELS.payg,
    outputs: null,
    price: PLAN_PRICES.payg,
    target: 'Creators testing Genfeed or running bursty campaigns',
    tier: 'payg',
    type: 'payg',
    valueProposition:
      'Sign up free. Buy credits. Pay only for the output you actually generate.',
  },

  // Pro Tier - $49/month subscription with included credits
  {
    cta: 'Start Pro',
    ctaHref: `${process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT || 'https://app.genfeed.ai'}/sign-up?plan=pro`,
    description: 'Monthly subscription with included credits at a better rate',
    features: [
      includedCreditsFeature('pro'),
      'Unlimited seats',
      '1 organization',
      'Unlimited brands and connected channels',
      'API access (standard rate limits)',
      'Best model auto-routed for every job',
      'Top up with credit packs anytime',
      'Email support',
    ],
    includedCredits: TIER_INCLUDED_MONTHLY_CREDITS.pro,
    interval: 'month',
    label: PLAN_LABELS.pro,
    launchNote: `EARLYGENFEED · 12 months, then $${PLAN_PRICES.pro}/mo`,
    launchPrice: 39,
    outputs: null,
    price: PLAN_PRICES.pro,
    stripePriceId: STRIPE_PRICE_IDS.pro,
    target: 'Creators and founders publishing every week',
    tier: 'pro',
    type: 'subscription',
    valueProposition:
      'For steady publishing: a monthly fee that buys more output per dollar while credits stay the output meter.',
  },

  // Scale Tier - higher-entry team studio
  {
    cta: 'Talk to Sales',
    ctaHref: CALENDLY_URL,
    description: 'One studio for teams, organizations, and brands',
    features: [
      includedCreditsFeature('scale'),
      'Unlimited seats',
      'Multiple organizations, one shared credit pool',
      'Unlimited brands and connected channels',
      'API access (higher rate limits)',
      'Roles, budgets, and shared approvals',
      'Advanced analytics',
      'Priority support (24hr)',
    ],
    includedCredits: TIER_INCLUDED_MONTHLY_CREDITS.scale,
    interval: 'month',
    label: PLAN_LABELS.scale,
    outputs: null,
    price: PLAN_PRICES.scale,
    stripePriceId: STRIPE_PRICE_IDS.scale,
    target: 'Agencies and teams managing multiple brands or organizations',
    tier: 'scale',
    type: 'subscription',
    valueProposition:
      'Unlimited seats and a shared credit pool for teams that have outgrown a single workspace. You pay for output, not headcount.',
  },

  // Enterprise Tier - custom deployment
  {
    cta: 'Book a Demo',
    ctaHref: CALENDLY_URL,
    description: 'Custom studio, governance, and support',
    features: [
      'Custom credit terms',
      'Unlimited seats',
      'Unlimited organizations',
      'Unlimited brands and connected channels',
      'Full API access (custom rate limits + SLA)',
      'White-label (custom domain + branding)',
      'SSO & team management',
      'Dedicated account manager and Slack support',
      'SLA 99.9% uptime',
    ],
    interval: 'month',
    label: PLAN_LABELS.enterprise,
    outputs: null,
    price: PLAN_PRICES.enterprise,
    stripePriceId: STRIPE_PRICE_IDS.enterprise,
    target: 'Studios, white-label partners, large teams',
    tier: 'enterprise',
    type: 'enterprise',
    valueProposition: 'Your own AI content operating system, fully managed.',
  },
];

/**
 * Get plan by label
 */
export function getPlanByLabel(label: string): WebsitePlanProps | undefined {
  return websitePlans.find(
    (plan) => plan.label.toLowerCase() === label.toLowerCase(),
  );
}

/**
 * Get a plan by its stable tier identifier. Throws if the tier is missing so a
 * mistyped or removed plan fails at build time instead of rendering blank copy.
 */
export function getPlanByTier(tier: PlanTier): WebsitePlanProps {
  const plan = websitePlans.find((candidate) => candidate.tier === tier);

  if (!plan) {
    throw new Error(`Missing pricing plan for tier: ${tier}`);
  }

  return plan;
}

/**
 * Display name for a tier. Use this everywhere a plan is named in copy.
 */
export function getPlanLabel(tier: PlanTier): string {
  return PLAN_LABELS[tier];
}

/**
 * Marketing price label for a tier, e.g. "$49/mo", "Free", "Custom".
 */
export function formatPlanPriceLabel(tier: PlanTier): string {
  const { price } = getPlanByTier(tier);

  if (price === null) {
    return 'Custom';
  }
  if (price === 0) {
    return 'Free';
  }

  return `$${formatPricingNumber(price)}/mo`;
}

/**
 * Discounted launch price for a tier, e.g. "$39/mo", or `null` when the tier
 * carries no launch offer. Callers render `formatPlanPriceLabel` as the struck
 * list price next to it, plus the plan's `launchNote` for the terms.
 */
export function formatPlanLaunchPriceLabel(tier: PlanTier): string | null {
  const { launchPrice } = getPlanByTier(tier);

  if (launchPrice == null) {
    return null;
  }

  return `$${formatPricingNumber(launchPrice)}/mo`;
}

/**
 * Long-form price for prose, e.g. "$49/month", "free", "custom".
 */
export function formatPlanMonthlyPrice(tier: PlanTier): string {
  const { price } = getPlanByTier(tier);

  if (price === null) {
    return 'custom';
  }
  if (price === 0) {
    return 'free';
  }

  return `$${formatPricingNumber(price)}/month`;
}

/**
 * Included monthly credits for prose, e.g. "5,900 credits". Empty string for
 * tiers that grant no monthly credits.
 */
export function formatPlanIncludedCredits(tier: PlanTier): string {
  const { includedCredits } = getPlanByTier(tier);

  if (includedCredits == null) {
    return '';
  }

  return `${formatPricingNumber(includedCredits)} credits`;
}

/**
 * Pay-as-you-go value of a tier's included credits, e.g. "$59". Empty string
 * for tiers that grant no monthly credits.
 */
export function formatPlanIncludedCreditsValue(tier: PlanTier): string {
  const { includedCredits } = getPlanByTier(tier);

  if (includedCredits == null) {
    return '';
  }

  return `$${formatPricingNumber(includedCredits * BYOK_CREDIT_VALUE_DOLLARS)}`;
}

/**
 * How much cheaper a tier's included credits are than the standard PAYG rate,
 * e.g. "~17%". Derived from the tier's own price and credit grant so repricing
 * a plan can never leave a stale percentage in marketing copy. Empty string for
 * tiers with no price or no monthly credits.
 */
export function formatPlanCreditRateAdvantage(tier: PlanTier): string {
  const { includedCredits, price } = getPlanByTier(tier);

  if (includedCredits == null || !price) {
    return '';
  }

  const effectiveRate = price / includedCredits;
  const advantage = 1 - effectiveRate / BYOK_CREDIT_VALUE_DOLLARS;

  return `~${Math.round(advantage * 100)}%`;
}

/**
 * Ready-to-interpolate copy tokens for one plan.
 */
export interface PlanCopyProps {
  /** How much cheaper included credits are than PAYG, e.g. "~17%" ('' when none). */
  creditRateAdvantage: string;
  /** Included monthly credits in prose, e.g. "5,900 credits" ('' when none). */
  includedCredits: string;
  /** PAYG value of the included credits, e.g. "$59" ('' when none). */
  includedCreditsValue: string;
  /** Prose price, e.g. "$49/month", "free", "custom". */
  monthlyPrice: string;
  /** Display name, e.g. "Pro". */
  name: string;
  /** Name plus prose price, e.g. "Pro ($49/month)". */
  nameWithPrice: string;
  /** Compact price label, e.g. "$49/mo", "Free", "Custom". */
  priceLabel: string;
}

function buildPlanCopy(tier: PlanTier): PlanCopyProps {
  const name = getPlanLabel(tier);
  const monthlyPrice = formatPlanMonthlyPrice(tier);

  return {
    creditRateAdvantage: formatPlanCreditRateAdvantage(tier),
    includedCredits: formatPlanIncludedCredits(tier),
    includedCreditsValue: formatPlanIncludedCreditsValue(tier),
    monthlyPrice,
    name,
    nameWithPrice: `${name} (${monthlyPrice})`,
    priceLabel: formatPlanPriceLabel(tier),
  };
}

/**
 * Every plan name, price, and credit grant that appears in marketing copy.
 * Interpolate from here instead of writing a plan name or price into a string,
 * so renaming or repricing a plan updates every surface at once.
 */
export const PLAN_COPY = {
  enterprise: buildPlanCopy('enterprise'),
  payg: buildPlanCopy('payg'),
  pro: buildPlanCopy('pro'),
  scale: buildPlanCopy('scale'),
} satisfies Record<PlanTier, PlanCopyProps>;

/**
 * Get Pro tier plan
 */
export function getProPlan(): WebsitePlanProps {
  return getPlanByTier('pro');
}

/**
 * Get Scale tier plan
 */
export function getScalePlan(): WebsitePlanProps {
  return getPlanByTier('scale');
}

/**
 * Get Enterprise tier plan
 */
export function getEnterprisePlan(): WebsitePlanProps {
  return getPlanByTier('enterprise');
}

/**
 * Format price for display
 */
export function formatPrice(price: number | null): string {
  if (price === null) {
    return 'Contact Sales';
  }
  if (price === 0) {
    return 'Free';
  }
  return `$${formatPricingNumber(price)}`;
}

/**
 * Format outputs for display
 */
export function formatOutputs(
  outputs: PricingPlanProps['outputs'],
): string | null {
  if (!outputs) {
    return null;
  }

  const parts: string[] = [];
  if (outputs.videoMinutes) {
    parts.push(`${outputs.videoMinutes} min video`);
  }
  if (outputs.images) {
    parts.push(`${formatPricingNumber(outputs.images)} images`);
  }
  if (outputs.voiceMinutes) {
    parts.push(`${outputs.voiceMinutes} min voice`);
  }

  return parts.join(' · ');
}

/**
 * PAYG credit top-up presets (Replicate-style). Flat rate: 1 credit = $0.01,
 * no bonus. Checkout also accepts any custom amount between the min and max
 * below; the presets are just convenient defaults.
 */
export const PAYG_CREDIT_PACKS: CreditPackTier[] = [
  { bonus: null, credits: 1_000, label: '$10' },
  { bonus: null, credits: 2_000, label: '$20' },
  { bonus: null, credits: 5_000, label: '$50' },
  { bonus: null, credits: 10_000, label: '$100' },
  { bonus: null, credits: 100_000, label: '$1,000' },
];

/** Custom PAYG top-up bounds in whole dollars (1 credit = $0.01). */
export const PAYG_CREDITS_PER_USD = 100;
export const PAYG_MIN_PURCHASE_USD = 10;
export const PAYG_MAX_PURCHASE_USD = 10_000;

/** Subset of top-up presets shown on public marketing pages (website, home). */
export const WEBSITE_CREDIT_PACKS = PAYG_CREDIT_PACKS.filter((p) =>
  ['$10', '$100', '$1,000'].includes(p.label),
);

/**
 * Get total credits for a pack (base + bonus).
 */
export function creditPackTotalCredits(pack: CreditPackTier): number {
  return pack.credits + (pack.bonus ?? 0);
}

/**
 * Convert credits to approximate output estimates.
 * Uses INTERNAL_CREDIT_COSTS for calculations.
 */
export function creditsToOutputEstimate(credits: number): {
  images: number;
  videoMinutes: number;
  voiceMinutes: number;
} {
  const rawImages = credits / INTERNAL_CREDIT_COSTS.image;
  const rawVideoMin = credits / INTERNAL_CREDIT_COSTS.videoPerSecond / 60;
  const rawVoiceMin = credits / INTERNAL_CREDIT_COSTS.voicePerMinute;

  return {
    images: Math.round(rawImages / 100) * 100,
    videoMinutes: Math.round(rawVideoMin),
    voiceMinutes: Math.round(rawVoiceMin / 100) * 100,
  };
}

/**
 * Calculate the dollar price for a credit pack.
 * Exchange rate: 1 credit = $0.01 (bonus credits are free).
 */
export function creditPackPrice(pack: CreditPackTier): number {
  return pack.credits * 0.01;
}
