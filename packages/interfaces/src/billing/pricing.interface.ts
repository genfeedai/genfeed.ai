/**
 * Shared pricing-related interfaces.
 * Concrete pricing values live in @genfeedai/pricing.
 */

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
