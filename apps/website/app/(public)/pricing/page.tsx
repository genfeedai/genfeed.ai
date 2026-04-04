import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PricingContent from '@public/pricing/pricing-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing',
  'Bring your own AI keys for free, or buy credit packs with no subscription. BYOK is free forever. Credit packs from $999.',
  '/pricing',
);

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  description:
    'AI content generation pricing. BYOK (free) or pay-as-you-go credit packs.',
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
          'Bring your own AI keys and use the full platform for free. You pay AI providers directly.',
        name: 'BYOK',
        price: '0',
        priceCurrency: 'USD',
        url: 'https://genfeed.ai/pricing',
      },
      {
        '@type': 'Offer',
        description:
          '99,900 credits for AI content generation. Premium models included.',
        name: 'Creator Credit Pack',
        price: '999',
        priceCurrency: 'USD',
        url: 'https://genfeed.ai/pricing',
      },
      {
        '@type': 'Offer',
        description:
          '275,000 credits with 10% discount. Premium models included.',
        name: 'Professional Credit Pack',
        price: '2475',
        priceCurrency: 'USD',
        url: 'https://genfeed.ai/pricing',
      },
      {
        '@type': 'Offer',
        description:
          '625,000 credits with 20% discount. Priority support included.',
        name: 'Enterprise Credit Pack',
        price: '5000',
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
