import { metadata } from '@helpers/media/metadata/metadata.helper';
import { createServiceLandingMetadata } from '@web-components/landing/service-landing-metadata';
import { serviceLandingConfigs } from '@web-components/landing/service-landings.data';
import { describe, expect, it } from 'vitest';

describe('service landing share images', () => {
  it.each([
    'founder-content',
    'x',
    'linkedin',
    'instagram',
    'tiktok',
    'youtube',
    'threads',
    'facebook',
    'pinterest',
  ])('positions /%s as an agent product in social shares', (slug) => {
    const config = serviceLandingConfigs.find(
      (landing) => landing.slug === slug,
    );
    if (!config) throw new Error(`Missing landing configuration for ${slug}`);
    const result = createServiceLandingMetadata(config);
    expect(result.title).toMatch(/agent/i);
    expect(result.description).toMatch(/agent/i);
    expect(result.description).not.toMatch(/service|book a call|retainer/i);
    expect(result.alternates?.canonical).toBe(`/${slug}`);
  });

  it.each(serviceLandingConfigs)(
    'gives $slug the correct complete OG and Twitter image',
    (config) => {
      const result = createServiceLandingMetadata(config);
      const images = [
        {
          alt: config.metaTitle,
          height: 630,
          type: 'image/png',
          url: `${metadata.url}/og/${config.slug}`,
          width: 1200,
        },
      ];

      expect(result.openGraph?.images).toEqual(images);
      expect(result.twitter?.images).toEqual(images);
      expect(result.openGraph?.url).toBe(`${metadata.url}/${config.slug}`);
    },
  );
});
