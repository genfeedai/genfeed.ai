import type { AppProduct } from '@data/app-products.data';

const WEBSITE_URL = 'https://genfeed.ai';
const PRODUCTS_URL = `${WEBSITE_URL}/products`;

const PUBLISHER = {
  '@type': 'Organization',
  name: 'Genfeed',
  url: WEBSITE_URL,
} as const;

export function getAppProductUrl(slug: string): string {
  return `${PRODUCTS_URL}/${slug}`;
}

export function buildAppProductJsonLd(product: AppProduct) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'MultimediaApplication',
    applicationSuite: 'Genfeed',
    description: product.definition,
    featureList: product.highlights,
    name: `Genfeed ${product.name}`,
    offers: {
      '@type': 'Offer',
      description: 'Free to start. Credits pay for the output you generate.',
      price: '0',
      priceCurrency: 'USD',
    },
    operatingSystem: 'Web',
    publisher: PUBLISHER,
    url: getAppProductUrl(product.slug),
  };
}

export function buildAppProductBreadcrumbJsonLd(product: AppProduct) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', item: WEBSITE_URL, name: 'Home', position: 1 },
      {
        '@type': 'ListItem',
        item: PRODUCTS_URL,
        name: 'Products',
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: getAppProductUrl(product.slug),
        name: product.name,
        position: 3,
      },
    ],
  };
}

export function buildAppProductFaqJsonLd(product: AppProduct) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: product.faqs.map(({ answer, question }) => ({
      '@type': 'Question',
      acceptedAnswer: { '@type': 'Answer', text: answer },
      name: question,
    })),
  };
}

export function buildAppProductsHubJsonLd(
  products: AppProduct[],
  description: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    description,
    isPartOf: { '@type': 'WebSite', name: 'Genfeed', url: WEBSITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        name: `Genfeed ${product.name}`,
        position: index + 1,
        url: getAppProductUrl(product.slug),
      })),
    },
    name: 'Genfeed products',
    url: PRODUCTS_URL,
  };
}

export function buildAppProductsHubBreadcrumbJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', item: WEBSITE_URL, name: 'Home', position: 1 },
      {
        '@type': 'ListItem',
        item: PRODUCTS_URL,
        name: 'Products',
        position: 2,
      },
    ],
  };
}
