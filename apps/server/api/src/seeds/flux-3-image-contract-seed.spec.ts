import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { seedFlux3ImageContract } from '@api/seeds/flux-3-image-contract-seed';
import {
  FLUX_3_PROVIDER_COSTS,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import { applyMargin, quoteModelBillablePricing } from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';

function mockPrisma(
  reviewed: string | null = null,
  pending: string | null = null,
) {
  return {
    model: {
      findUnique: vi.fn().mockResolvedValue({
        reviewedProviderContractVersion: reviewed,
        pendingProviderContractVersion: pending,
      }),
      updateMany: vi.fn(),
    },
    modelProviderContract: { upsert: vi.fn() },
  };
}
describe('FLUX.3 dated provider evidence', () => {
  it.each([
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
    MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
  ])('seeds authoritative pricing for every resolution on %s', async (key) => {
    const prisma = mockPrisma();
    await seedFlux3ImageContract(prisma as never, 'model-flux', key);
    const contract =
      prisma.modelProviderContract.upsert.mock.calls[0][0].create;
    const update = prisma.model.updateMany.mock.calls[0][0].data;
    expect(contract.endpoint).toBe(
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
    );
    expect(contract.outputSchema).toEqual({
      type: 'string',
      title: 'Output',
      format: 'uri',
    });
    const profile = projectModelBillablePricingProfile(
      {
        id: 'model-flux',
        key,
        provider: 'replicate',
        isActive: true,
        isDeleted: false,
        isFree: false,
        cost: 8,
        providerCostUsd: 0.024,
        pricingType: 'flat',
        costPerUnit: null,
        minCost: null,
        hasResolutionOptions: false,
        hasAudioToggle: false,
        pendingProviderContractVersion: null,
        ...update,
      } as never,
      [contract],
    );
    for (const [resolution, cost] of Object.entries(FLUX_3_PROVIDER_COSTS)) {
      const quote = quoteModelBillablePricing(
        profile,
        {
          modelKey: key,
          provider: 'replicate',
          outputs: 1,
          requests: 1,
          selectors: { resolution },
        },
        3.33,
        '2026-10-01T01:00:00.000Z',
      );
      expect(quote.status, JSON.stringify(quote)).toBe('priced');
      if (quote.status !== 'priced') throw new Error(quote.reason);
      expect(quote.snapshot.providerCostUsd).toBe(cost);
      expect(quote.snapshot.credits).toBe(applyMargin(cost, 3.33));
    }
    expect(
      quoteModelBillablePricing(
        profile,
        {
          modelKey: key,
          provider: 'replicate',
          selectors: { resolution: '8k' },
        },
        3.33,
        '2026-10-01T01:00:00.000Z',
      ).status,
    ).toBe('unresolved');
  });
  it('uses distinct contracts for the shared endpoint', async () => {
    const prisma = mockPrisma();
    await seedFlux3ImageContract(
      prisma as never,
      'generation',
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
    );
    await seedFlux3ImageContract(
      prisma as never,
      'editing',
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
    );
    expect(
      prisma.modelProviderContract.upsert.mock.calls[0][0].create.version,
    ).not.toBe(
      prisma.modelProviderContract.upsert.mock.calls[1][0].create.version,
    );
  });
  it.each([
    ['operator', null],
    [null, 'drift'],
  ])(
    'preserves operator review and drift ownership',
    async (reviewed, pending) => {
      const prisma = mockPrisma(reviewed, pending);
      await seedFlux3ImageContract(
        prisma as never,
        'model',
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
      );
      expect(prisma.modelProviderContract.upsert).not.toHaveBeenCalled();
      expect(prisma.model.updateMany).not.toHaveBeenCalled();
    },
  );
});
