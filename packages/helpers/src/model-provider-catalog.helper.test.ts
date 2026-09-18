import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

import { getProviderBrands } from './model-provider-catalog.helper';

describe('getProviderBrands', () => {
  it('accounts for every catalog model key exactly once', () => {
    const total = getProviderBrands().reduce(
      (sum, brand) => sum + brand.modelCount,
      0,
    );

    expect(total).toBe(Object.values(MODEL_KEYS).length);
  });

  it('groups the Higgsfield catalog under one brand', () => {
    const higgsfield = getProviderBrands().find(
      (brand) => brand.slug === 'higgsfield-ai',
    );

    expect(higgsfield).toMatchObject({ label: 'Higgsfield' });
    // Soul plus the three DoP tiers.
    expect(higgsfield?.modelCount).toBe(4);
    expect(higgsfield?.categories).toEqual(['Image', 'Video']);
  });

  it('orders brands by how many models they contribute', () => {
    const counts = getProviderBrands().map((brand) => brand.modelCount);

    expect([...counts].sort((left, right) => right - left)).toEqual(counts);
  });
});
