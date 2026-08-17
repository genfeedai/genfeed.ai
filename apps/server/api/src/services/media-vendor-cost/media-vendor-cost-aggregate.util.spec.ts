import { foldMediaVendorCostGroups } from '@api/services/media-vendor-cost/media-vendor-cost-aggregate.util';

describe('foldMediaVendorCostGroups', () => {
  it('folds platform and BYOK rows into one per-model aggregate', () => {
    const aggregates = foldMediaVendorCostGroups([
      {
        _count: { _all: 3 },
        _sum: { units: 24, vendorCostMicros: 5_760_000 },
        isByok: false,
        model: 'bytedance/seedance-2.5',
        provider: 'replicate',
      },
      {
        _count: { _all: 2 },
        _sum: { units: 10, vendorCostMicros: 999 },
        isByok: true,
        model: 'bytedance/seedance-2.5',
        provider: 'replicate',
      },
    ]);

    expect(aggregates).toEqual([
      {
        byokGenerationCount: 2,
        generationCount: 5,
        model: 'bytedance/seedance-2.5',
        platformGenerationCount: 3,
        provider: 'replicate',
        units: 34,
        // BYOK vendor cost is excluded even when stored non-zero.
        vendorCostMicros: 5_760_000,
      },
    ]);
  });

  it('sorts aggregates by provider then model and tolerates null sums', () => {
    const aggregates = foldMediaVendorCostGroups([
      {
        _count: { _all: 1 },
        _sum: { units: null, vendorCostMicros: null },
        isByok: false,
        model: 'z-model',
        provider: 'fal',
      },
      {
        _count: { _all: 1 },
        _sum: { units: 1, vendorCostMicros: 40_000 },
        isByok: false,
        model: 'a-model',
        provider: 'fal',
      },
    ]);

    expect(aggregates.map((a) => a.model)).toEqual(['a-model', 'z-model']);
    expect(aggregates[1]).toMatchObject({ units: 0, vendorCostMicros: 0 });
  });
});
