import { stringifyJsonLd } from '@data/json-ld';
import type { PlanTier } from '@genfeedai/pricing';
import { PLAN_COPY, websitePlans } from '@genfeedai/pricing';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import PricingContent from '@public/pricing/pricing-content';
import { serviceOffering } from '@web-components/landing/service-offering.data';
import { buildDoneForYouJsonLd } from '@web-components/landing/service-offering-jsonld';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

// @genfeedai/pricing is the contract: PAYG and Pro are one seat, Scale and
// Enterprise have unlimited seats and client workspaces. page.spec.tsx pins
// this wording and its length: a 205-character description was truncated in
// search results and flagged "Meta description too long" by the 2026-08-19
// site audit.
export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing: Pro, Scale, Enterprise and PAYG',
  `${PLAN_COPY.pro.nameWithPrice} for creators, ${PLAN_COPY.scale.nameWithPrice} for agencies, ${PLAN_COPY.enterprise.name} ${serviceOffering.priceLabel.toLowerCase()} with content made for you.`,
  '/pricing',
);

/**
 * Structured-data blurb per plan. Names and prices are never written here: they
 * come from @genfeedai/pricing so the JSON-LD offers cannot drift from the page.
 */
const OFFER_DESCRIPTIONS: Record<PlanTier, string> = {
  enterprise:
    'Enterprise plan with custom output terms, SSO, SLA, and dedicated support.',
  payg: 'Pay-per-output credits with no monthly fee. Buy credit packs for images, video, voice, and articles.',
  pro: `For creators and single brands: every app, a pool of ${PLAN_COPY.pro.includedCredits}, clean exports, and any agent model.`,
  scale: `For agencies: unlimited seats and client workspaces, a shared pool of ${PLAN_COPY.scale.includedCredits}, clean exports, brand model training, and higher API limits.`,
};

export function buildPricingJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    about: buildDoneForYouJsonLd(),
    description: `Genfeed is free to join with pay-per-output credits. ${PLAN_COPY.pro.nameWithPrice} adds every app and monthly credits. ${PLAN_COPY.scale.nameWithPrice} adds unlimited seats and client workspaces for agencies. ${PLAN_COPY.enterprise.name} is ${serviceOffering.priceLabel.toLowerCase()}, with our team making your content.`,
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
