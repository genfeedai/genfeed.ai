import {
  type ModelWithPricingContracts,
  projectModelDurationsByResolution,
} from '@api/collections/models/utils/model-reviewed-pricing.util';
import { describe, expect, it } from 'vitest';

type Contract = NonNullable<
  ModelWithPricingContracts['providerContracts']
>[number];

function rate(resolution: string, duration: number, unitPriceUsd: number) {
  return {
    component: 'output',
    unit: 'output',
    unitPriceUsd,
    when: { duration, resolution },
  };
}

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    conditionalDimensions: {},
    discoveredAt: new Date('2026-10-01T00:00:00.000Z'),
    endpoint: 'minimax/hailuo-2.3-fast',
    lastSeenAt: new Date('2026-10-06T00:00:00.000Z'),
    mappingStatus: 'supported',
    pricing: {
      currency: 'USD',
      rates: [
        rate('768p', 6, 0.19),
        rate('768p', 10, 0.32),
        rate('1080p', 6, 0.33),
      ],
      sourceUrl: 'https://replicate.com/minimax/hailuo-2.3-fast',
      verifiedAt: '2026-10-06T09:45:37.023Z',
    },
    provider: 'replicate',
    reviewStatus: 'approved',
    version: 'v1',
    ...overrides,
  } as Contract;
}

function model(
  providerContracts: Contract[] | undefined,
): ModelWithPricingContracts {
  return {
    cost: 0,
    endpoint: 'minimax/hailuo-2.3-fast',
    isActive: true,
    isDeleted: false,
    isFree: false,
    key: 'minimax/hailuo-2.3-fast',
    pricingType: 'conditional',
    provider: 'replicate',
    providerContracts,
    reviewedProviderContractVersion: 'v1',
  } as unknown as ModelWithPricingContracts;
}

describe('projectModelDurationsByResolution', () => {
  it('reads each resolution’s clip lengths from the reviewed rates', () => {
    expect(projectModelDurationsByResolution(model([contract()]))).toEqual({
      '1080p': [6],
      '768p': [6, 10],
    });
  });

  it('follows the provider when a reviewed contract adds a length', () => {
    const updated = contract({
      pricing: {
        currency: 'USD',
        rates: [
          rate('768p', 6, 0.19),
          rate('1080p', 6, 0.33),
          rate('1080p', 10, 0.6),
        ],
        sourceUrl: 'https://replicate.com/minimax/hailuo-2.3-fast',
        verifiedAt: '2026-10-06T09:45:37.023Z',
      },
    });
    expect(projectModelDurationsByResolution(model([updated]))).toEqual({
      '1080p': [6, 10],
      '768p': [6],
    });
  });

  it('has no limits without an approved reviewed contract', () => {
    expect(projectModelDurationsByResolution(model(undefined))).toBeUndefined();
    expect(
      projectModelDurationsByResolution(
        model([contract({ reviewStatus: 'pending' })]),
      ),
    ).toBeUndefined();
  });
});
