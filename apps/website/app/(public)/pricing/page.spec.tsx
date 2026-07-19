import * as PageModule from '@public/pricing/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/pricing/page', PageModule);

describe('pricing metadata', () => {
  it('keeps seats unlimited across paid subscriptions', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.description).toContain('unlimited team seats');
    expect(result.description).toContain(
      'Scale adds multi-organization workflows',
    );
    expect(result.description).not.toContain('Scale unlocks unlimited seats');
  });
});
