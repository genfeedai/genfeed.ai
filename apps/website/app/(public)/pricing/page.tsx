import { stringifyJsonLd } from '@data/json-ld';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PricingContent from '@public/pricing/pricing-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing',
  'Free to sign up. Credits buy the output you generate. Subscriptions from $49/mo include monthly credits at a better rate, plus more brands, channels, and seats.',
  '/pricing',
);

const saasJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  description:
    'Genfeed is free to join with pay-per-output credits. Creator ($49/month) includes 8,000 credits at a better rate. Teams ($499/month) adds seats, a shared credit pool, and multi-organization workflows.',
  mainEntity: {
    '@type': 'Product',
    brand: { '@type': 'Organization', name: 'Genfeed' },
    description:
      'The AI studio for creating, approving, publishing, and tracking videos, images, voice, and marketing content.',
    name: 'Genfeed',
    offers: [
      {
        '@type': 'Offer',
        description:
          'Free account with pay-per-output credits. Buy credit packs and spend them on images, video, voice, and articles.',
        name: 'Pay As You Go',
        price: '0',
        priceCurrency: 'USD',
        url: 'https://genfeed.ai/pricing',
      },
      {
        '@type': 'Offer',
        description:
          'Monthly subscription with 8,000 included credits at a better rate, 5 brand kits, and 15 connected channels.',
        name: 'Creator',
        price: '49',
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          billingDuration: 'P1M',
        },
        url: 'https://genfeed.ai/pricing',
      },
      {
        '@type': 'Offer',
        description:
          'For teams: 5 seats, an 80,000-credit shared pool, multi-organization workflows, approvals, and managed billing.',
        name: 'Teams',
        price: '499',
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          billingDuration: 'P1M',
        },
        url: 'https://genfeed.ai/pricing',
      },
      {
        '@type': 'Offer',
        description:
          'Enterprise plan with custom output terms, SSO, SLA, and dedicated support.',
        name: 'Enterprise',
        priceCurrency: 'USD',
        url: 'https://genfeed.ai/pricing',
      },
    ],
  },
  name: 'Genfeed Pricing',
  url: 'https://genfeed.ai/pricing',
};

export default function Pricing() {
  return (
    <>
      <script type="application/ld+json">{stringifyJsonLd(saasJsonLd)}</script>
      <PricingContent />
    </>
  );
}
