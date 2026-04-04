import type { ServiceLandingConfig } from '@web-components/landing/service-landings.data';
import type { Metadata } from 'next';

export const createServiceLandingMetadata = (
  config: ServiceLandingConfig,
): Metadata => ({
  alternates: {
    canonical: `/${config.slug}`,
  },
  description: config.metaDescription,
  openGraph: {
    description: config.metaDescription,
    title: config.metaTitle,
    url: `https://genfeed.ai/${config.slug}`,
  },
  title: config.metaTitle,
});
