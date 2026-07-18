import * as PageModule from '@public/(home)/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/(home)/page', PageModule);

describe('homepage metadata', () => {
  it('positions Genfeed as AI-agent distribution infrastructure', async () => {
    const parent = Promise.resolve({
      openGraph: { images: ['https://cdn.genfeed.ai/previous.jpg'] },
    }) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.title).toBe(
      'Genfeed.ai | Distribution infrastructure for AI agents',
    );
    expect(result.description).toMatch(
      /connect claude code or codex through mcp/i,
    );
    expect(result.openGraph?.title).toBe(result.title);
    expect(result.twitter?.title).toBe(result.title);
    expect(result.openGraph?.images).toEqual([
      'https://cdn.genfeed.ai/previous.jpg',
    ]);
  });
});
