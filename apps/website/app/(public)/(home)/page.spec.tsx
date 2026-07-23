import * as PageModule from '@public/(home)/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/(home)/page', PageModule);

describe('homepage metadata', () => {
  it('positions Genfeed as the AI content studio', async () => {
    const parent = Promise.resolve({
      openGraph: { images: ['https://cdn.genfeed.ai/previous.jpg'] },
    }) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.title).toBe('Genfeed.ai | The AI content studio');
    expect(result.description).toMatch(/the ai content studio/i);
    expect(result.openGraph?.title).toBe(result.title);
    expect(result.twitter?.title).toBe(result.title);
    expect(result.openGraph?.images).toEqual([
      'https://cdn.genfeed.ai/previous.jpg',
    ]);
  });
});
