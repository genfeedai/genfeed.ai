import { serviceOffering } from '@web-components/landing/service-offering.data';

export function buildDoneForYouJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    description: serviceOffering.description,
    name: serviceOffering.name,
    offers: {
      '@type': 'Offer',
      description: serviceOffering.priceNote,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        billingDuration: 'P1M',
        minPrice: serviceOffering.startingMonthlyPrice,
        priceCurrency: 'USD',
        unitText: 'month',
      },
      url: 'https://genfeed.ai/done-for-you#book',
    },
    provider: { '@type': 'Organization', name: 'Genfeed' },
    url: 'https://genfeed.ai/done-for-you',
  };
}
