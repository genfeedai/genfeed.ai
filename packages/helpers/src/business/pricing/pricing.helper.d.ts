/**
 * Genfeed.ai Pricing Configuration
 *
 * SINGLE SOURCE OF TRUTH for all pricing across the platform.
 * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
 *
 * Pricing Strategy:
 * - Output-based pricing (videos, images, voice) - NOT credit-based
 * - Premium positioning ($499-$4,999/month)
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
    process: {
        step: string;
        description: string;
    }[];
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
/**
 * BYOK Platform Fee Configuration
 * 5% fee on BYOK usage after a free monthly threshold.
 * Exchange rate: 1 credit = $0.01
 */
export declare const BYOK_FEE_PERCENTAGE = 5;
export declare const BYOK_FREE_THRESHOLD_CREDITS = 500;
export declare const BYOK_CREDIT_VALUE_DOLLARS = 0.01;
export declare const BYOK_FEE_PER_CREDIT: number;
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
export declare function applyMargin(providerCostUsd: number): number;
/**
 * Internal credit costs (hidden from users)
 * Used for margin tracking and cost accounting only
 *
 * Exchange rate: 1 credit = $0.01
 * Pricing formula: Sell Price = Cost / 0.30 (70% margin target)
 *
 * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
 */
export declare const INTERNAL_CREDIT_COSTS: {
    /** Avatar/Lip-sync per second: 100 credits = $1.00/sec */
    readonly avatarPerSecond: 100;
    /** Image (1K/2K): 50 credits = $0.50 (70% margin on $0.15 cost) */
    readonly image: 50;
    /** Image (4K): 100 credits = $1.00 (70% margin on $0.30 cost) */
    readonly image4k: 100;
    /** Video per second: 75 credits = $0.75/sec */
    readonly videoPerSecond: 75;
    /** Voice per minute: 17 credits = $0.17 (70% margin on $0.05 cost) */
    readonly voicePerMinute: 17;
};
/**
 * Video duration helpers
 * Standard video durations and their credit costs
 */
export declare const VIDEO_CREDIT_COSTS: {
    /** 4 second video: 300 credits = $3.00 */
    readonly video4s: number;
    /** 8 second video: 600 credits = $6.00 */
    readonly video8s: number;
    /** 15 second video: 1125 credits = $11.25 */
    readonly video15s: number;
};
/**
 * Avatar duration helpers
 * Standard avatar durations and their credit costs
 */
export declare const AVATAR_CREDIT_COSTS: {
    /** 4 second avatar: 400 credits = $4.00 */
    readonly avatar4s: number;
    /** 8 second avatar: 800 credits = $8.00 */
    readonly avatar8s: number;
    /** 15 second avatar: 1500 credits = $15.00 */
    readonly avatar15s: number;
};
/**
 * Website pricing plans - displayed on public pricing page
 * Output-based pricing for premium positioning
 */
export declare const websitePlans: PricingPlanProps[];
/**
 * Get plan by label
 */
export declare function getPlanByLabel(label: string): PricingPlanProps | undefined;
/**
 * Get Pro tier plan
 */
export declare function getProPlan(): PricingPlanProps;
/**
 * Get Scale tier plan
 */
export declare function getScalePlan(): PricingPlanProps;
/**
 * Get Enterprise tier plan
 */
export declare function getEnterprisePlan(): PricingPlanProps;
/**
 * Format price for display
 */
export declare function formatPrice(price: number | null): string;
/**
 * Format outputs for display
 */
export declare function formatOutputs(outputs: PricingPlanProps['outputs']): string | null;
/**
 * Creator Tier - $50/month (UNLISTED - invite only)
 *
 * This is a secret offering for individual content creators.
 * NOT displayed on the website or pricing page.
 * Only accessible via direct link or invite.
 */
export declare const creatorPlan: PricingPlanProps;
/**
 * Get Creator tier plan (unlisted)
 */
export declare function getCreatorPlan(): PricingPlanProps;
/**
 * Dedicated Server plan - Custom pricing for open-source models on dedicated infrastructure
 */
export declare const dedicatedServerPlan: PricingPlanProps;
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
export declare const PAYG_CREDIT_PACKS: CreditPackTier[];
/** Subset of credit packs shown on public pages (website, home). Settings/checkout use full list. */
export declare const WEBSITE_CREDIT_PACKS: CreditPackTier[];
/**
 * Get total credits for a pack (base + bonus).
 */
export declare function creditPackTotalCredits(pack: CreditPackTier): number;
/**
 * Convert credits to approximate output estimates.
 * Uses INTERNAL_CREDIT_COSTS for calculations.
 */
export declare function creditsToOutputEstimate(credits: number): {
    images: number;
    videoMinutes: number;
    voiceMinutes: number;
};
/**
 * Calculate the dollar price for a credit pack.
 * Exchange rate: 1 credit = $0.01 (bonus credits are free).
 */
export declare function creditPackPrice(pack: CreditPackTier): number;
/**
 * Done-For-You content service offering
 * Full-service content creation retainer
 */
export declare const contentServiceOffering: ServiceOfferingProps;
/**
 * Setup & Training packages
 * One-time onboarding and training sessions
 */
export declare const TRAINING_PACKAGES: TrainingPackageProps[];
export {};
//# sourceMappingURL=pricing.helper.d.ts.map