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
 *   credits are priced at ~50% margin (Creator $49 → 8,000 credits ≈ $80 of
 *   PAYG output; Cloud Teams $499 → 80,000 credits ≈ $800 of PAYG output)
 * - Brand kits, connected channels, and seats are gated by tier
 * - Models are never user-selected: the Genfeed router picks the best model
 *   for each format, brief, and budget
 *
 * @updated 2026-07-03
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
  /** Display label (e.g., "Hosted", "Cloud Teams", "Enterprise") */
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
  creator: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_CREATOR_MONTHLY,
  enterprise:
    process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY,
  // Convenience aliases
  monthly: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY,
  pro: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY,
  scale: process.env.NEXT_PUBLIC_STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY,
} as const;

/**
 * BYOK Platform Fee Configuration
 * 5% fee on BYOK usage after a free monthly threshold.
 * Exchange rate: 1 credit = $0.01
 */
export const BYOK_FEE_PERCENTAGE = 5;
export const BYOK_FREE_THRESHOLD_CREDITS = 500;
export const BYOK_CREDIT_VALUE_DOLLARS = 0.01;
export const BYOK_FEE_PER_CREDIT =
  BYOK_CREDIT_VALUE_DOLLARS * (BYOK_FEE_PERCENTAGE / 100);

/**
 * Apply 70% margin to a provider cost in USD.
 * Returns the sell price in credits (1 credit = $0.01).
 *
 * Formula: Sell Price (USD) = providerCostUsd / 0.30
 * Credits = Sell Price / BYOK_CREDIT_VALUE_DOLLARS
 *
 * @example applyMargin(0.15) → 50 credits ($0.50 sell price on $0.15 cost)
 * @example applyMargin(0.50) → 167 credits ($1.67 sell price on $0.50 cost)
 */
export function applyMargin(providerCostUsd: number): number {
  const sellPriceUsd = providerCostUsd / 0.3;
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
      '1 brand kit',
      '3 connected channels',
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

  // Hosted / Creator Tier - $49/month subscription with included credits
  {
    cta: 'Start Creator',
    ctaHref: `${process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT || 'https://app.genfeed.ai'}/sign-up?plan=hosted`,
    description: 'Monthly subscription with included credits at a better rate',
    features: [
      '8,000 credits included monthly (≈ $80 of pay-as-you-go output)',
      'Included credits ~40% cheaper than the standard rate',
      'Best model auto-routed for every job',
      '5 brand kits',
      '15 connected channels',
      'Top up with credit packs anytime',
      'Email support',
    ],
    includedCredits: 8_000,
    interval: 'month',
    label: 'Hosted',
    launchNote: 'Launch pricing — first 12 months, then $49/month',
    launchPrice: 39,
    outputs: null,
    price: 49,
    stripePriceId: STRIPE_PRICE_IDS.pro,
    target: 'Creators and founders publishing every week',
    type: 'subscription',
    valueProposition:
      'For steady publishing: a monthly fee that buys more output per dollar, plus more brands and channels.',
  },

  // Cloud Teams Tier - higher-entry B2B cloud
  {
    cta: 'Talk to Sales',
    ctaHref: CALENDLY_URL,
    description: 'B2B cloud for teams, organizations, and brands',
    features: [
      '80,000 credits included monthly (≈ $800 of pay-as-you-go output)',
      '5 team seats included, then $49/seat/month',
      'Shared credit pool with budgets',
      'Multi-organization account model',
      'Multi-brand operations',
      'Roles, shared approvals, and brand kits',
      'Priority support (24hr)',
      'Advanced analytics',
    ],
    includedCredits: 80_000,
    interval: 'month',
    label: 'Cloud Teams',
    outputs: null,
    price: 499,
    stripePriceId: STRIPE_PRICE_IDS.scale,
    target: 'Agencies and teams managing multiple brands or organizations',
    type: 'subscription',
    valueProposition:
      'Seats plus a shared credit pool for teams that have outgrown a single workspace.',
  },

  // Enterprise Tier - custom B2B deployment
  {
    cta: 'Book a Demo',
    ctaHref: CALENDLY_URL,
    description: 'Custom cloud, governance, and support',
    features: [
      'Custom output terms',
      'Unlimited team seats',
      'Unlimited organizations and brand kits',
      'Full API access',
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
 * Get Hosted tier plan
 */
export function getHostedPlan(): PricingPlanProps {
  return getRequiredPlan('Hosted');
}

/**
 * Get Cloud Teams tier plan
 */
export function getCloudTeamsPlan(): PricingPlanProps {
  return getRequiredPlan('Cloud Teams');
}

/**
 * @deprecated Use getHostedPlan.
 */
export function getProPlan(): PricingPlanProps {
  return getHostedPlan();
}

/**
 * @deprecated Use getCloudTeamsPlan.
 */
export function getScalePlan(): PricingPlanProps {
  return getCloudTeamsPlan();
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
 * Creator Tier - $50/month (UNLISTED - invite only)
 *
 * This is a secret offering for individual content creators.
 * NOT displayed on the website or pricing page.
 * Only accessible via direct link or invite.
 */
export const creatorPlan: PricingPlanProps = {
  cta: 'Subscribe',
  ctaHref: '/checkout/creator',
  description: 'For individual content creators',
  features: [
    '1 min video/month',
    '50 images/month',
    '15 min voice/month',
    '1 team seat',
    '1 brand kit',
    'Premium AI models (auto-selected)',
    'Email support',
  ],
  interval: 'month',
  label: 'Creator',
  outputs: {
    images: 50,
    videoMinutes: 1,
    voiceMinutes: 15,
  },
  price: 50,
  stripePriceId: STRIPE_PRICE_IDS.creator,
  target: 'Individual content creators',
  type: 'subscription',
  valueProposition:
    '5 studio-quality AI videos per month for less than a coffee a day.',
};

/**
 * Get Creator tier plan (unlisted)
 */
export function getCreatorPlan(): PricingPlanProps {
  return creatorPlan;
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
 * PAYG Credit Pack tiers
 * Stripe charges base credits × $0.01. Bonus credits delivered via metadata.
 * Exchange rate: 1 credit = $0.01
 */
export const PAYG_CREDIT_PACKS: CreditPackTier[] = [
  { bonus: null, credits: 9_900, label: 'Starter' },
  { bonus: null, credits: 49_900, label: 'Creator' },
  { bonus: 10_000, credits: 99_900, label: 'Pro' },
  { bonus: 37_500, credits: 249_900, label: 'Business' },
  { bonus: 100_000, credits: 499_900, label: 'Scale' },
];

/** Subset of credit packs shown on public pages (website, home). Settings/checkout use full list. */
export const WEBSITE_CREDIT_PACKS = PAYG_CREDIT_PACKS.filter((p) =>
  ['Starter', 'Pro', 'Scale'].includes(p.label),
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
