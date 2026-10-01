import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { seedImageEditingContract } from '@api/seeds/image-editing-contract-seed';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';

describe('image editing provider evidence seed', () => {
  it('seeds a dated medium editing rate compatible with authoritative billing', async () => {
    const prisma = {
      model: {
        findUnique: vi.fn().mockResolvedValue({
          reviewedProviderContractVersion: null,
          pendingProviderContractVersion: null,
        }),
        updateMany: vi.fn(),
      },
      modelProviderContract: { upsert: vi.fn() },
    };
    await seedImageEditingContract(prisma as never, 'model-edit');
    const contract =
      prisma.modelProviderContract.upsert.mock.calls[0][0].create;
    const update = prisma.model.updateMany.mock.calls[0][0].data;
    const profile = projectModelBillablePricingProfile(
      {
        id: 'model-edit',
        key: MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5,
        provider: 'replicate',
        isActive: true,
        isDeleted: false,
        isFree: false,
        cost: 20,
        providerCostUsd: 0.06,
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
    const quote = quoteModelBillablePricing(
      profile,
      {
        modelKey: profile.key,
        provider: profile.provider,
        outputs: 8,
        requests: 1,
        selectors: { quality: 'medium' },
      },
      3.33,
      '2026-10-01T01:00:00.000Z',
    );
    expect(quote.status).toBe('priced');
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(quote.snapshot.providerCostUsd).toBe(0.48);
    expect(quote.snapshot.credits).toBe(160);
    expect(
      quoteModelBillablePricing(
        profile,
        {
          modelKey: profile.key,
          provider: profile.provider,
          selectors: { quality: 'high' },
        },
        3.33,
        '2026-10-01T01:00:00.000Z',
      ).status,
    ).toBe('unresolved');
  });
  it.each([
    'reviewedProviderContractVersion',
    'pendingProviderContractVersion',
  ])('preserves operator review and drift gates: %s', async (field) => {
    const prisma = {
      model: {
        findUnique: vi.fn().mockResolvedValue({ [field]: 'operator-version' }),
        updateMany: vi.fn(),
      },
      modelProviderContract: { upsert: vi.fn() },
    };
    await seedImageEditingContract(prisma as never, 'model-edit');
    expect(prisma.modelProviderContract.upsert).not.toHaveBeenCalled();
    expect(prisma.model.updateMany).not.toHaveBeenCalled();
  });
});
