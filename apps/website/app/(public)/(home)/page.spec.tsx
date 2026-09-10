// biome-ignore assist/source/organizeImports: External packages precede project aliases.
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

import * as PageModule from '@public/(home)/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';

runPageModuleTests('apps/website/app/(public)/(home)/page', PageModule);

describe('homepage metadata', () => {
  it('positions Genfeed by what it does, not by its category', async () => {
    const parent = Promise.resolve({
      openGraph: { images: ['https://cdn.genfeed.ai/previous.jpg'] },
    }) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.title).toBe(
      'Genfeed.ai | Ask for content. Get it published.',
    );
    expect(result.description).toMatch(/tell the genfeed agent what you want/i);
    expect(result.openGraph?.title).toBe(result.title);
    expect(result.twitter?.title).toBe(result.title);
    expect(result.openGraph?.images).toEqual([
      'https://cdn.genfeed.ai/previous.jpg',
    ]);
  });
});
