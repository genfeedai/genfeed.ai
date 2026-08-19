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

  it('keeps the meta description inside the search-snippet budget', async () => {
    const parent = Promise.resolve({}) as ResolvingMetadata;

    const result = await PageModule.generateMetadata({}, parent);

    // Ahrefs flags anything over 158 characters as "Meta description too long".
    expect(result.description?.length).toBeGreaterThanOrEqual(100);
    expect(result.description?.length).toBeLessThanOrEqual(158);
  });

  it('keeps the JSON-LD entitlement copy aligned with pricing metadata', () => {
    const jsonLd = PageModule.buildPricingJsonLd();

    expect(jsonLd.description).toContain(
      'all paid tiers include unlimited seats',
    );
    expect(jsonLd.description).toContain(
      'adds a shared credit pool and multi-organization workflows',
    );
    expect(jsonLd.description).not.toContain('adds unlimited seats');
  });
});
