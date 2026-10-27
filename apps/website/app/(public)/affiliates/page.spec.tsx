import * as PageModule from '@public/affiliates/page';
import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it } from 'vitest';

runPageModuleTests('apps/website/app/(public)/affiliates/page', PageModule);

describe('affiliates metadata', () => {
  it('states the enforced reward and keeps the description inside the snippet budget', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    expect(result.description).toContain('10%');
    expect(result.description).toContain('12 months');
    expect(result.description?.length).toBeGreaterThanOrEqual(100);
    expect(result.description?.length).toBeLessThanOrEqual(158);
  });
});
