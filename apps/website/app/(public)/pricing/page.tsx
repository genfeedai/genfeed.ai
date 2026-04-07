import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PricingContent from '@public/pricing/pricing-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing',
  'Simple pricing that scales with you. Free self-hosted or managed cloud plans from $499/mo.',
  '/pricing',
);

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  description:
    'AI content generation pricing. Self-host free or subscribe to managed cloud plans.',
  mainEntity: {
    '@type': 'Product',
    brand: {
      '@type': 'Organization',
      name: 'Genfeed',
    },
    description:
      'AI-powered content generation platform for creating professional videos, images, and marketing materials at scale.',
    name: 'Genfeed',
    offers: [
      {
        '@type': 'Offer',
        description:
          'Self-host the full platform on your own infrastructure with your own AI keys.',
        name: 'Self-Hosted',
        price: '0',
        priceCurrency: 'USD',
        url: 'https://genfeed.ai/host',
      },
      {
        '@type': 'Offer',
        description:
          'Managed cloud plan for creators and small agencies. 500 images, 5 min video, 60 min voice per month.',
        name: 'Pro',
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
          'Managed cloud plan for agencies managing multiple brands. 2,000 images, 15 min video, 200 min voice per month.',
        name: 'Scale',
        price: '1499',
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
          'Enterprise plan with unlimited generation, SSO, SLA, and dedicated support.',
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
      <script type="application/ld+json">
        {JSON.stringify(pricingJsonLd)}
      </script>
      <PricingContent />
    </>
  );
}
