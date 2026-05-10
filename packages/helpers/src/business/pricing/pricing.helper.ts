/**
 * Genfeed.ai Pricing Configuration
 *
 * SINGLE SOURCE OF TRUTH for all pricing across the platform.
 * See: https://github.com/genfeedai/genfeed.ai/issues?q=is%3Aissue+pricing
 *
 * Pricing Strategy:
 * - Self-hosted core is free with bring-your-own AI keys
 * - Cloud App starts at $8/month plus pay-as-you-go output
 * - Cloud is higher-entry B2B for collaboration, multi-org, and multi-brand use
 * - Credits are tracked internally but NEVER shown to users
 * - Auto-select premium AI models (no user decision fatigue)
 *
 * @updated 2026-01-21
 */

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
}

export interface ServiceOfferingProps {
  /** Service name */
  name: string;
  /** Short description */
  description: string;
  /** What's included */
  includes: string[];
  /** How it works — ordered steps */
  process: { step: string; description: string }[];
  /** CTA link (Calendly) */
  ctaHref: string;
}

export interface TrainingPackageProps {
  /** Package name */
  name: string;
  /** Short description */
  description: string;
  /** What's included */
  includes: string[];
  /** Price label (e.g. "$499", "Custom") */
  priceLabel: string;
  /** CTA link (Calendly) */
  ctaHref: string;
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
 * OSS core, hosted PAYG, and B2B cloud positioning
 */
export const websitePlans: PricingPlanProps[] = [
  // Self-Hosted Tier - Deploy on your own infrastructure ($0)
  {
    cta: 'Deploy Free',
    ctaHref: '/host',
    description: 'Deploy on your infrastructure',
    features: [
      'Full platform access',
      'Your own AI keys',
      'Your own infrastructure',
      'Community support',
      'AGPL-3.0 license',
    ],
    interval: 'payg',
    label: 'Self-Hosted',
    outputs: null,
    price: 0,
    target: 'Developers and teams who want full control',
    type: 'byok',
    valueProposition: 'Full platform on your servers. You manage everything.',
  },

  // Hosted / Cloud App Tier - $8/month + PAYG output
  {
    cta: 'Start Cloud App',
    ctaHref: `${process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT || 'https://app.genfeed.ai'}/sign-up?plan=hosted`,
    description: 'Managed app access with usage-based output',
    features: [
      '$8/month platform access',
      'Pay-as-you-go videos, images, and voice',
      'No infrastructure to manage',
      'Premium AI models (auto-selected)',
      'Personal workspace',
      '1 brand kit',
      'Multi-platform publishing',
      'Email support',
    ],
    interval: 'payg',
    label: 'Hosted',
    outputs: null,
    price: 8,
    stripePriceId: STRIPE_PRICE_IDS.pro,
    target: 'Creators and founders who want managed Genfeed without DevOps',
    type: 'payg',
    valueProposition:
      'Start hosted for a small platform fee, then pay only for the output you create.',
  },

  // Cloud Teams Tier - higher-entry B2B cloud
  {
    cta: 'Talk to Sales',
    ctaHref: CALENDLY_URL,
    description: 'B2B cloud for teams, organizations, and brands',
    features: [
      'Collaboration workspaces',
      'Multi-organization account model',
      'Multi-brand operations',
      'Roles and team permissions',
      'Shared brand kits and approvals',
      'Managed infrastructure and updates',
      'Priority support (24hr)',
      'Advanced analytics',
      'PAYG output with managed billing',
    ],
    interval: 'month',
    label: 'Cloud Teams',
    outputs: null,
    price: 499,
    stripePriceId: STRIPE_PRICE_IDS.scale,
    target: 'Agencies and teams managing multiple brands or organizations',
    type: 'subscription',
    valueProposition:
      'A managed collaboration layer for teams that have outgrown a single hosted workspace.',
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

  return parts.join(' \u00b7 ');
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
export interface CreditPackTier {
  /** Display label */
  label: string;
  /** Number of base credits in pack */
  credits: number;
  /** Bonus credits (null = no bonus) */
  bonus: number | null;
}

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
