import type {
  ISubscription,
  SubscriptionChangePreview,
} from '@cloud/interfaces';
import type { ReactNode } from 'react';

export interface SubscriptionGuardProps {
  children: ReactNode;
  requireSubscription?: boolean;
  requiredPlan?: 'monthly' | 'payg';
  fallback?: ReactNode;
  redirectTo?: string;
}

export interface SubscriptionPlanChangerProps {
  subscription: ISubscription;
  onPreviewChange: (newPriceId: string) => Promise<SubscriptionChangePreview>;
  onChangePlan: (newPriceId: string) => Promise<void>;
}

/**
 * Output quotas for pricing tiers (user-facing, not credits)
 * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
 */
export interface PricingOutputsProps {
  /** Video generation in minutes per month */
  videoMinutes?: number;
  /** Number of images per month */
  images?: number;
  /** Voice generation in minutes per month */
  voiceMinutes?: number;
}

/**
 * Pricing plan configuration
 * See: https://github.com/genfeedai/cloud/issues?q=is%3Aissue+pricing
 */
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
  /** Feature list for pricing card */
  features: string[];
  /** Monthly price in USD (null for contact sales) */
  price: number | null;
  /** Output quotas (video minutes, images, voice) - user-facing */
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

export interface TeamPricingProps {
  baseWorkspaceFee: number;
  includedOutputs: {
    videos: number;
    images: number;
  };
  additionalPricing: {
    videoPrice: number;
    imagePrice: number;
  };
  minSeats: number;
  maxSeats: number | null;
}

export interface PricingSubscriptionsProps {
  onSubscribe?: (plan: PricingPlanProps) => void;
  subscription?: ISubscription | null;
}
