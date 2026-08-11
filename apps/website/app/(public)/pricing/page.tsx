import { stringifyJsonLd } from '@data/json-ld';
import type { PlanTier } from '@genfeedai/pricing';
import { PLAN_COPY, websitePlans } from '@genfeedai/pricing';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PricingContent from '@public/pricing/pricing-content';

// Seats are not a Scale-only entitlement, and reviews keep reading them that
// way. @genfeedai/pricing is the contract: FREE/BYOK is one seat, every paid
// tier (Pro, Scale, Enterprise) has unlimited seats, and what Scale adds is
// multi-organization workflows. page.spec.tsx pins this wording.
export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing: Credits, Pro and Scale Plans',
  `Free to sign up. Credits buy the output you generate. Subscriptions from ${PLAN_COPY.pro.priceLabel} include monthly credits at a better rate, paid API access, and unlimited team seats; ${PLAN_COPY.scale.name} adds multi-organization workflows.`,
  '/pricing',
);

/**
 * Structured-data blurb per plan. Names and prices are never written here: they
 * come from @genfeedai/pricing so the JSON-LD offers cannot drift from the page.
 */
const OFFER_DESCRIPTIONS: Record<PlanTier, string> = {
  enterprise:
    'Enterprise plan with custom output terms, SSO, SLA, and dedicated support.',
  payg: 'Free account with pay-per-output credits. Buy credit packs and spend them on images, video, voice, and articles.',
  pro: `Monthly subscription with ${PLAN_COPY.pro.includedCredits} included at a better rate, unlimited brand kits, unlimited connected channels, and API access.`,
  scale: `For teams: unlimited seats, a shared pool of ${PLAN_COPY.scale.includedCredits}, multi-organization workflows, approvals, and managed billing.`,
};

export function buildPricingJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    description: `Genfeed is free to join with pay-per-output credits. ${PLAN_COPY.pro.nameWithPrice} includes ${PLAN_COPY.pro.includedCredits} at a better rate, and all paid tiers include unlimited seats. ${PLAN_COPY.scale.nameWithPrice} adds a shared credit pool and multi-organization workflows.`,
    mainEntity: {
      '@type': 'Product',
      brand: { '@type': 'Organization', name: 'Genfeed' },
      description:
        'The AI studio for creating, approving, publishing, and tracking videos, images, voice, and marketing content.',
      image: metadata.cards.default,
      name: 'Genfeed',
      // Enterprise is quote-only. A schema.org Offer needs a price or a
      // priceSpecification, and inventing one would misstate the deal, so
      // quote-only tiers are left out of the offer list entirely.
      offers: websitePlans
        .filter((plan) => plan.price != null)
        .map((plan) => ({
          '@type': 'Offer',
          description: OFFER_DESCRIPTIONS[plan.tier],
          name: plan.label,
          price: String(plan.price),
          priceCurrency: 'USD',
          priceSpecification:
            plan.type === 'subscription'
              ? { '@type': 'UnitPriceSpecification', billingDuration: 'P1M' }
              : undefined,
          url: 'https://genfeed.ai/pricing',
        })),
    },
    name: 'Genfeed Pricing',
    url: 'https://genfeed.ai/pricing',
  };
}

export default function Pricing() {
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildPricingJsonLd())}
      </script>
      <PricingContent />
    </>
  );
}
