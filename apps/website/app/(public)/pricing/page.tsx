import { stringifyJsonLd } from '@data/json-ld';
import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PricingContent from '@public/pricing/pricing-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing',
  'Cloud app access from $49/mo plus pay-as-you-go output. Add paid team seats and multi-organization workflows when your content operation grows.',
  '/pricing',
);

const saasJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  description:
    'Genfeed Cloud App pricing starts at $49/month plus pay-as-you-go output. Cloud Teams adds paid seats, collaboration, multi-organization workflows, and managed billing.',
  mainEntity: {
    '@type': 'Product',
    brand: { '@type': 'Organization', name: 'Genfeed' },
    description:
      'Managed AI content workspace for creating, approving, publishing, and tracking videos, images, voice, and marketing content.',
    name: 'Genfeed',
    offers: [
      {
        '@type': 'Offer',
        description:
          'Managed cloud app access for creators and founders. Platform access is billed monthly, with output billed as pay-as-you-go usage.',
        name: 'Cloud App',
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
          'B2B cloud for agencies and teams managing multiple organizations, brands, approvals, and managed billing.',
        name: 'Cloud Teams',
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
