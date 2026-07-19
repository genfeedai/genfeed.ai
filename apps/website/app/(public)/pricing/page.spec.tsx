import * as PageModule from '@public/pricing/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/pricing/page', PageModule);

describe('pricing metadata', () => {
  it('reserves unlimited seats for Scale', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.description).toContain('shared team seats');
    expect(result.description).toContain('Scale unlocks unlimited seats');
    expect(result.description).not.toContain('and unlimited team seats');
  });
});
