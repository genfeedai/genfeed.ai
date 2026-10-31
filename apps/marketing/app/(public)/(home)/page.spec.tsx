// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

import * as PageModule from '@public/(home)/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/marketing/app/(public)/(home)/page', PageModule);

describe('homepage metadata', () => {
  it('positions Genfeed by what it does, not by its category', async () => {
    const parent = Promise.resolve({
      openGraph: { images: ['https://cdn.genfeed.ai/previous.jpg'] },
    }) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.title).toBe('Genfeed.ai | Ask once. Show up everywhere.');
    expect(result.description).toBe(
      'Genfeed is an open-source content agent. Create on-brand videos, images and posts, then review and publish to your connected channels.',
    );
    expect(result.openGraph?.description).toBe(result.description);
    expect(result.twitter?.description).toBe(result.description);
    expect(result.openGraph?.title).toBe(result.title);
    expect(result.twitter?.title).toBe(result.title);
    expect(result.openGraph?.images).toEqual([
      expect.objectContaining({
        url: 'https://genfeed.ai/og/home',
        width: 1200,
        height: 630,
        type: 'image/png',
      }),
    ]);
  });

  it('offers the OG video as og:video beside the og:image fallback', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.openGraph?.videos).toEqual([
      {
        height: 630,
        type: 'video/mp4',
        url: 'https://cdn.genfeed.ai/assets/og/home.mp4',
        width: 1200,
      },
    ]);
    expect(result.openGraph?.images).toHaveLength(1);
  });
});
