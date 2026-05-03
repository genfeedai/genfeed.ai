import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PricingContent from '@public/pricing/pricing-content';

const isPreLaunch = process.env.NEXT_PUBLIC_LAUNCH_MODE !== 'open';

export const generateMetadata = createPageMetadataWithCanonical(
  'Pricing',
  isPreLaunch
    ? 'AI content services — managed Studio access or Done-For-You content creation.'
    : 'Free self-hosted Core, hosted access from $8/mo plus PAYG output, and B2B Cloud for teams.',
  '/pricing',
);

const preLaunchJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  description: 'AI content services. Book a call to discuss fit.',
  mainEntity: {
    '@type': 'Product',
    brand: { '@type': 'Organization', name: 'Genfeed' },
    description: 'Managed AI content creation for agencies and brands.',
    name: 'Genfeed Studio',
    offers: [
      {
        '@type': 'Offer',
        name: 'Studio',
        price: '9999',
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          billingDuration: 'P1M',
        },
        url: 'https://genfeed.ai/pricing',
      },
      {
        '@type': 'Offer',
        name: 'Done-For-You Content',
        price: '2500',
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          billingDuration: 'P1M',
        },
        url: 'https://genfeed.ai/services',
      },
    ],
  },
  name: 'Genfeed Services & Pricing',
  url: 'https://genfeed.ai/pricing',
};

const saasJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  description:
    'AI content generation pricing. Self-host Core free, use Hosted from $8/month plus PAYG output, or choose Cloud for B2B collaboration.',
  mainEntity: {
    '@type': 'Product',
    brand: { '@type': 'Organization', name: 'Genfeed' },
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
          'Managed hosted access for creators and founders. Platform access is billed monthly, with output billed as pay-as-you-go usage.',
        name: 'Hosted',
        price: '8',
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
          'B2B cloud for agencies and teams managing multiple organizations and brands.',
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

const pricingJsonLd = isPreLaunch ? preLaunchJsonLd : saasJsonLd;

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
