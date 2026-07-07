/**
 * Genfeed.ai Pricing Configuration
 *
 * Canonical source for all plan, credit, BYOK, and service pricing.
 * See: https://github.com/genfeedai/genfeed.ai/issues/486
 *
 * Pricing Strategy:
 * - Credits are the user-facing unit of output: 1 credit = $0.01 at the
 *   pay-as-you-go rate (~70% margin on provider cost, see applyMargin)
 * - Pay As You Go is free to join: buy credit packs, spend on any output
 * - Subscriptions sell a better credit rate, not access: included monthly
 *   credits are priced at ~50% margin (Pro $49 → 8,000 credits ≈ $80 of
 *   PAYG output; Scale $499 → 80,000 credits ≈ $800 of PAYG output)
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
} from '@genfeedai/interfaces';

export type { CreditPackTier, ServiceOfferingProps, TrainingPackageProps };

interface PricingOutputsProps {
  /** Video generation in minutes per month */
  videoMinutes?: number;
  /** Number of images per month */
  images?: number;
  /** Voice generation in minutes per month */
  voiceMinutes?: number;
}

interface PricingPlanProps {
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

/** Monthly included credits per paid subscription tier (source of truth for credit grants). */
export const TIER_INCLUDED_MONTHLY_CREDITS: Record<string, number> = {
  pro: 8_000,
  scale: 80_000,
};

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
export const MAX_MARGIN_MULTIPLIER = 10;
export const BYOK_FEE_PER_CREDIT =
  BYOK_CREDIT_VALUE_DOLLARS * (BYOK_FEE_PERCENTAGE / 100);

/**
 * Process-scoped margin multiplier applied on top of the base provider-cost
 * markup. Hydrated from the `PlatformSetting.marginMultiplier` operator knob at
 * runtime (API on boot/update, workers per model-discovery run) so that every
 * `applyMargin` call site in a process stays consistent without threading the
 * value through their signatures. Defaults to 1.0 (base margin only).
 */
let runtimeMarginMultiplier = 1;

/** Normalize a candidate multiplier, falling back to 1.0 when invalid. */
function normalizeMarginMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return 1;
  }

  return Math.min(multiplier, MAX_MARGIN_MULTIPLIER);
}

/**
 * Set the process-scoped margin multiplier. Non-finite or non-positive values
 * fall back to 1.0 so a misconfigured knob can never zero out pricing.
 */
export function setRuntimeMarginMultiplier(multiplier: number): void {
  runtimeMarginMultiplier = normalizeMarginMultiplier(multiplier);
}

/** Read the current process-scoped margin multiplier. */
export function getRuntimeMarginMultiplier(): number {
  return runtimeMarginMultiplier;
}

/**
 * Apply the base 70% margin to a provider cost in USD, optionally scaled by an
 * operator-configured margin multiplier. Returns the sell price in credits
 * (1 credit = $0.01).
 *
 * Formula: Sell Price (USD) = (providerCostUsd / 0.30) * marginMultiplier
 * Credits = Sell Price / BYOK_CREDIT_VALUE_DOLLARS
 *
 * @param providerCostUsd Raw provider cost in USD.
 * @param marginMultiplier Extra markup on top of the base margin, configured by
 *   platform operators in /admin (see PlatformSetting.marginMultiplier).
 *   1.0 = base margin only, 1.2 = +20% markup. Defaults to the process-scoped
 *   runtime multiplier (see setRuntimeMarginMultiplier). Non-finite or
 *   non-positive values fall back to 1.0 so a misconfigured knob can never zero
 *   out pricing.
 * @example applyMargin(0.15) → 50 credits ($0.50 sell price on $0.15 cost)
 * @example applyMargin(0.50) → 167 credits ($1.67 sell price on $0.50 cost)
 * @example applyMargin(0.15, 1.2) → 60 credits ($0.60 sell price)
 */
export function applyMargin(
  providerCostUsd: number,
  marginMultiplier: number = runtimeMarginMultiplier,
): number {
  const safeMultiplier = normalizeMarginMultiplier(marginMultiplier);
  const sellPriceUsd =
    (providerCostUsd / BASE_PROVIDER_COST_FRACTION) * safeMultiplier;
  const credits = Math.ceil(sellPriceUsd / BYOK_CREDIT_VALUE_DOLLARS);
  return Math.max(credits, 2); // absolute minimum floor
}

/**
 * Internal credit costs (hidden from users)
 * Used for margin tracking and cost accounting only
 *
 * Exchange rate: 1 credit = $0.01
 * Pricing formula: Sell Price = Cost / 0.30 (70% margin target)
 *
 * See: https://github.com/genfeedai/genfeed.ai/issues?q=is%3Aissue+pricing
 */
export const INTERNAL_CREDIT_COSTS = {
  /** Long-form article: 25 credits = $0.25 (70% margin on ~$0.075 LLM cost) */
  articlePerPost: 25,
  /** Avatar/Lip-sync per second: 100 credits = $1.00/sec */
  avatarPerSecond: 100,
  /** Image (1K/2K): 50 credits = $0.50 (70% margin on $0.15 cost) */
  image: 50,
  /** Image (4K): 100 credits = $1.00 (70% margin on $0.30 cost) */
  image4k: 100,
  /** Video per second: 75 credits = $0.75/sec */
  videoPerSecond: 75,
  /** Voice per minute: 17 credits = $0.17 (70% margin on $0.05 cost) */
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
 * Website pricing plans - displayed on public pricing page
 * Free-to-join PAYG credits, subscriptions with included credits, B2B cloud
 */
export const websitePlans: PricingPlanProps[] = [
  // Pay As You Go Tier - free account, credits only ($0/month)
  {
    cta: 'Start Free',
    ctaHref: `${process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT || 'https://app.genfeed.ai'}/sign-up?plan=payg`,
    description: 'Free account with pay-per-output credits',
    features: [
      'No monthly fee, buy credits and spend on any format',
      'Credits at the standard rate (1 credit = $0.01)',
      'Best model auto-routed for every job',
      'Unlimited brand kits',
      'Unlimited connected channels',
      '1 organization',
      'Multi-platform publishing',
      'Email support',
    ],
    interval: 'payg',
    label: 'Pay As You Go',
    outputs: null,
    price: 0,
    target: 'Creators testing Genfeed or running bursty campaigns',
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
      '8,000 credits included monthly (≈ $80 of pay-as-you-go output)',
      'Included credits ~40% cheaper than the standard rate',
      'Best model auto-routed for every job',
      'Unlimited brands',
      'Unlimited connected channels',
      '1 organization',
      'API access (standard rate limits)',
      'Top up with credit packs anytime',
      'Email support',
    ],
    includedCredits: 8_000,
    interval: 'month',
    label: 'Pro',
    launchNote:
      'Launch pricing (code EARLYGENFEED) — first 12 months, then $49/month',
    launchPrice: 39,
    outputs: null,
    price: 49,
    stripePriceId: STRIPE_PRICE_IDS.pro,
    target: 'Creators and founders publishing every week',
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
      '80,000 credits included monthly (≈ $800 of pay-as-you-go output)',
      'Unlimited team seats',
      'Shared credit pool with budgets',
      'Multi-organization account model',
      'Unlimited brands',
      'Roles and shared approvals',
      'API access (higher rate limits)',
      'Priority support (24hr)',
      'Advanced analytics',
    ],
    includedCredits: 80_000,
    interval: 'month',
    label: 'Scale',
    outputs: null,
    price: 499,
    stripePriceId: STRIPE_PRICE_IDS.scale,
    target: 'Agencies and teams managing multiple brands or organizations',
    type: 'subscription',
    valueProposition:
      'Unlimited seats and a shared credit pool for teams that have outgrown a single workspace — you pay for output, not headcount.',
  },

  // Enterprise Tier - custom deployment
  {
    cta: 'Book a Demo',
    ctaHref: CALENDLY_URL,
    description: 'Custom studio, governance, and support',
    features: [
      'Custom output terms',
      'Unlimited team seats',
      'Unlimited organizations and brand kits',
      'Full API access (custom rate limits + SLA)',
      'White-label (custom domain + branding)',
      'Dedicated Slack support',
      'SSO & team management',
      'Dedicated account manager',
      'SLA 99.9% uptime',
    ],
    interval: 'month',
    label: 'Enterprise',
    outputs: null,
    price: null,
    stripePriceId: STRIPE_PRICE_IDS.enterprise,
    target: 'Studios, white-label partners, large teams',
    type: 'enterprise',
    valueProposition: 'Your own AI content operating system, fully managed.',
  },
];

/**
 * Get plan by label
 */
export function getPlanByLabel(label: string): PricingPlanProps | undefined {
  return websitePlans.find(
    (plan) => plan.label.toLowerCase() === label.toLowerCase(),
  );
}

function getRequiredPlan(label: string): PricingPlanProps {
  const plan = getPlanByLabel(label);

  if (!plan) {
    throw new Error(`Missing pricing plan: ${label}`);
  }

  return plan;
}

/**
 * Get Pro tier plan
 */
export function getProPlan(): PricingPlanProps {
  return getRequiredPlan('Pro');
}

/**
 * Get Scale tier plan
 */
export function getScalePlan(): PricingPlanProps {
  return getRequiredPlan('Scale');
}

/**
 * @deprecated Use getProPlan.
 */
export function getHostedPlan(): PricingPlanProps {
  return getProPlan();
}

/**
 * @deprecated Use getScalePlan.
 */
export function getCloudTeamsPlan(): PricingPlanProps {
  return getScalePlan();
}

/**
 * Get Enterprise tier plan
 */
export function getEnterprisePlan(): PricingPlanProps {
  return getRequiredPlan('Enterprise');
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
  return `$${price.toLocaleString()}`;
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
    parts.push(`${outputs.images.toLocaleString()} images`);
  }
  if (outputs.voiceMinutes) {
    parts.push(`${outputs.voiceMinutes} min voice`);
  }

  return parts.join(' · ');
}

/**
 * Dedicated Server plan - Custom pricing for open-source models on dedicated infrastructure
 */
export const dedicatedServerPlan: PricingPlanProps = {
  cta: 'Book a Call',
  ctaHref: CALENDLY_URL,
  description: 'Your own AI infrastructure with managed content creation',
  features: [
    'Dedicated server infrastructure',
    'Run any open-source model (Llama, Mistral, SD, etc.)',
    'No API rate limits or quotas',
    'Managed content creation service',
    'Full control over model selection',
    'Cost-based pricing (server costs only)',
  ],
  interval: 'month',
  label: 'Dedicated',
  outputs: null,
  price: null,
  target: 'Studios and brands wanting unlimited open-source AI',
  type: 'enterprise',
  valueProposition:
    'Run unlimited open-source models on your own dedicated server.',
};

/**
 * PAYG credit top-up presets (Replicate-style). Flat rate: 1 credit = $0.01,
 * no bonus. Checkout also accepts any custom amount between the min and max
 * below — the presets are just convenient defaults.
 */
export const PAYG_CREDIT_PACKS: CreditPackTier[] = [
  { bonus: null, credits: 1_000, label: '$10' },
  { bonus: null, credits: 2_000, label: '$20' },
  { bonus: null, credits: 5_000, label: '$50' },
  { bonus: null, credits: 10_000, label: '$100' },
  { bonus: null, credits: 100_000, label: '$1,000' },
];

/** Custom PAYG top-up bounds in whole dollars (1 credit = $0.01). */
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

/**
 * Done-For-You content service offering
 * Full-service content creation retainer
 */
export const contentServiceOffering: ServiceOfferingProps = {
  ctaHref: CALENDLY_URL,
  description:
    'We handle everything — strategy, production, publishing. You review and approve.',
  includes: [
    'Dedicated content strategist',
    'Unlimited video production',
    'Unlimited image generation',
    'AI voice production',
    'Social media copywriting',
    'Multi-platform scheduling',
    'Brand kit management',
    'Monthly content calendar',
    'Performance reporting',
    'Unlimited revisions',
  ],
  name: 'Done-For-You Content',
  process: [
    {
      description:
        'We learn your brand, audience, and goals in a 30-minute call.',
      step: 'Discovery Call',
    },
    {
      description:
        'We build your monthly content calendar with topics, formats, and channels.',
      step: 'Strategy & Calendar',
    },
    {
      description:
        'Our team creates all content — videos, images, copy — using Genfeed AI.',
      step: 'Production',
    },
    {
      description:
        'You review, request changes, and we publish across all platforms.',
      step: 'Review & Publish',
    },
  ],
};

/**
 * Setup & Training packages
 * One-time onboarding and training sessions
 */
export const TRAINING_PACKAGES: TrainingPackageProps[] = [
  {
    ctaHref: CALENDLY_URL,
    description: 'Get up and running in under an hour.',
    includes: [
      'Workspace configuration',
      '1 brand kit setup',
      '1-hour platform overview',
      'Publishing setup walkthrough',
      'Email support for 7 days',
    ],
    name: 'Quick Start',
    priceLabel: '$299',
  },
  {
    ctaHref: CALENDLY_URL,
    description: 'Custom deep-dive for advanced use cases.',
    includes: [
      'Custom agenda based on your needs',
      '2-hour live workshop',
      'Session recording',
      'Q&A follow-up',
      'Email support for 14 days',
    ],
    name: 'Training Sessions',
    priceLabel: '$499',
  },
  {
    ctaHref: CALENDLY_URL,
    description: 'Full onboarding for teams ready to scale.',
    includes: [
      'Up to 5 brand kits',
      'Full team training session',
      'Content strategy session',
      'Integration setup (socials, CMS)',
      '30-day email support',
    ],
    name: 'Full Onboarding',
    priceLabel: '$999',
  },
];
