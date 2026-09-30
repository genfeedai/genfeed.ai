import { metadata } from '@helpers/media/metadata/metadata.helper';
import type { ServiceLandingConfig } from '@web-components/landing/service-landings.data';
import type { Metadata } from 'next';

/**
 * Next.js shallow-replaces the root layout's `openGraph` object, so these
 * landing pages have to restate og:image, og:type and og:site_name themselves —
 * without them the pages ship an incomplete Open Graph card.
 */
export const createServiceLandingMetadata = (
  config: ServiceLandingConfig,
): Metadata => {
  const url = `${metadata.url}/${config.slug}`;
  const image = {
    alt: config.metaTitle,
    height: 630,
    type: 'image/png',
    url: config.slug === 'x' ? `${url}/og` : metadata.cards.default,
    width: 1200,
  };

  return {
    alternates: {
      canonical: `/${config.slug}`,
    },
    description: config.metaDescription,
    openGraph: {
      description: config.metaDescription,
      images: [image],
      siteName: metadata.name,
      title: config.metaTitle,
      type: 'website',
      url,
    },
    title: config.metaTitle,
    twitter: {
      card: 'summary_large_image',
      description: config.metaDescription,
      images: [image],
      title: config.metaTitle,
    },
  };
};
