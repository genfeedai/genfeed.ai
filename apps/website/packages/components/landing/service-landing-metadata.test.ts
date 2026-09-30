import { metadata } from '@helpers/media/metadata/metadata.helper';
import { createServiceLandingMetadata } from '@web-components/landing/service-landing-metadata';
import { serviceLandingConfigs } from '@web-components/landing/service-landings.data';
import { describe, expect, it } from 'vitest';

describe('service landing share images', () => {
  it.each(serviceLandingConfigs)(
    'gives $slug the correct complete OG and Twitter image',
    (config) => {
      const result = createServiceLandingMetadata(config);
      const images = [
        {
          alt: config.metaTitle,
          height: 630,
          type: 'image/png',
          url:
            config.slug === 'x'
              ? `${metadata.url}/x/og`
              : metadata.cards.default,
          width: 1200,
        },
      ];

      expect(result.openGraph?.images).toEqual(images);
      expect(result.twitter?.images).toEqual(images);
      expect(result.openGraph?.url).toBe(`${metadata.url}/${config.slug}`);
    },
  );
});
