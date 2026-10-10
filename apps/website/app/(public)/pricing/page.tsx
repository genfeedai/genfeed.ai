import { stringifyJsonLd } from '@data/json-ld';
import type { PlanTier } from '@genfeedai/pricing';
import {
  CREDIT_VALUE_DOLLARS,
  PLAN_COPY,
  websitePlans,
} from '@genfeedai/pricing';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import PricingContent from '@public/pricing/pricing-content';
import { serviceOffering } from '@web-components/landing/service-offering.data';
import { buildDoneForYouJsonLd } from '@web-components/landing/service-offering-jsonld';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

// Seats are not a Scale-only entitlement, and reviews keep reading them that
// way. @genfeedai/pricing is the contract: FREE is one seat, every paid
// tier (Pro, Scale, Enterprise) has unlimited seats, and what Scale adds is
// multi-organization workflows. page.spec.tsx pins this wording — and its
// length: the previous 205-character version was truncated in search results
// and flagged "Meta description too long" by the 2026-08-19 site audit.
export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing: PAYG, Pro, Scale and Done for you',
  `${PLAN_COPY.payg.name} credits; ${PLAN_COPY.pro.name} and ${PLAN_COPY.scale.name} with unlimited team seats and API access. ${serviceOffering.name} ${serviceOffering.priceLabel.toLowerCase()}. Book a call.`,
  '/pricing',
);

/**
 * Structured-data blurb per plan. Names and prices are never written here: they
 * come from @genfeedai/pricing so the JSON-LD offers cannot drift from the page.
 */
const OFFER_DESCRIPTIONS: Record<PlanTier, string> = {
  enterprise:
    'Enterprise plan with custom output terms, SSO, SLA, and dedicated support.',
  payg: `Pay-per-output credits at $${CREDIT_VALUE_DOLLARS.toFixed(2)} each, with no monthly fee. Buy credit packs for images, video, voice, and articles.`,
  pro: `Monthly subscription with ${PLAN_COPY.pro.includedCredits} included at a better rate, unlimited brand kits, unlimited connected channels, and API access.`,
  scale: `For teams: unlimited seats, a shared pool of ${PLAN_COPY.scale.includedCredits}, multi-organization workflows, approvals, and managed billing.`,
};

export function buildPricingJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    about: buildDoneForYouJsonLd(),
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
          description: [OFFER_DESCRIPTIONS[plan.tier], plan.launchNote]
            .filter(Boolean)
            .join(' '),
          name: plan.label,
          price: String(
            plan.type === 'payg'
              ? CREDIT_VALUE_DOLLARS
              : (plan.launchPrice ?? plan.price),
          ),
          priceCurrency: 'USD',
          priceSpecification:
            plan.type === 'payg'
              ? {
                  '@type': 'UnitPriceSpecification',
                  price: CREDIT_VALUE_DOLLARS,
                  priceCurrency: 'USD',
                  unitText: 'credit',
                }
              : plan.type === 'subscription'
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
