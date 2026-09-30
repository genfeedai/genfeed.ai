import { getMarketingOgImage } from '@data/marketing-og.data';
import { createPageMetadataWithCanonical as createCanonicalMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { Metadata } from 'next';

export function withMarketingOgMetadata(
  value: Metadata,
  path: string,
  title: string,
): Metadata {
  const image = getMarketingOgImage(path, title);
  return {
    ...value,
    openGraph: { ...value.openGraph, images: [image] },
    twitter: { ...value.twitter, images: [image] },
  };
}

export function createPageMetadataWithCanonical(
  ...options: Parameters<typeof createCanonicalMetadata>
) {
  const generate = createCanonicalMetadata(...options);
  return async (...args: Parameters<typeof generate>): Promise<Metadata> =>
    withMarketingOgMetadata(await generate(...args), options[2], options[0]);
}
