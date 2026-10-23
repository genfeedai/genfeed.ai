import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelProviderOffersService } from './model-provider-offers.service';

const pricing = vi.hoisted(() => ({ isReviewed: true }));
vi.mock(
  '@api/collections/models/utils/model-billable-pricing-profile.util',
  () => ({
    projectModelBillablePricingProfile: () => ({
      reviewedPricing: pricing.isReviewed
        ? {
            rates: [],
            sourceUrl: 'https://provider.example/prices',
            verifiedAt: '2026-10-23',
          }
        : null,
    }),
  }),
);
function fixture() {
  const logical = {
    id: 'logical',
    key: 'model',
    provider: 'replicate',
    category: 'video',
    organizationId: null,
    isDeleted: false,
    isActive: true,
    pinnedProvider: null,
    label: 'Model',
    description: null,
    providerContracts: [],
    providerOffers: [],
  };
  const source = {
    ...logical,
    id: 'source',
    key: 'provider/model',
    provider: 'fal',
  };
  const prisma = {
    model: {
      findFirst: vi
        .fn()
        .mockImplementation(async ({ where }) =>
          where.id === 'source' ? source : logical,
        ),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    modelProviderOffer: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    providerRoutingSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback) => callback(prisma));
  return {
    prisma,
    service: new ModelProviderOffersService(prisma as unknown as PrismaService),
  };
}
beforeEach(() => {
  pricing.isReviewed = true;
});
describe('admin model provider associations', () => {
  it('connects a reviewed registration and retains the native offer', async () => {
    const f = fixture();
    await f.service.update('logical', { executionModelId: 'source' });
    expect(f.prisma.modelProviderOffer.upsert).toHaveBeenCalledTimes(2);
    expect(f.prisma.model.update).toHaveBeenCalledWith({
      where: { id: 'source', organizationId: null, isDeleted: false },
      data: { isProviderVariant: true },
    });
  });
  it('refuses to activate unreviewed provider pricing', async () => {
    pricing.isReviewed = false;
    const f = fixture();
    await expect(
      f.service.update('logical', { executionModelId: 'source' }),
    ).rejects.toThrow('Review');
    expect(f.prisma.modelProviderOffer.upsert).not.toHaveBeenCalled();
  });
  it('allows an unpriced offer to be disabled', async () => {
    pricing.isReviewed = false;
    const f = fixture();
    await f.service.update('logical', {
      executionModelId: 'source',
      isActive: false,
    });
    expect(
      f.prisma.modelProviderOffer.upsert.mock.calls[1][0].update.isActive,
    ).toBe(false);
  });
  it('rejects a pin outside the connected providers', async () => {
    const f = fixture();
    await expect(
      f.service.update('logical', { pinnedProvider: 'other' }),
    ).rejects.toThrow('Pin an active connected provider');
  });
  it('persists a provider kill switch independently of model activation', async () => {
    const f = fixture();
    await f.service.setProviderActive('fal', false);
    expect(f.prisma.providerRoutingSetting.upsert).toHaveBeenCalledWith({
      where: { provider: 'fal' },
      create: { provider: 'fal', isActive: false },
      update: { isActive: false },
    });
    expect(f.prisma.model.update).not.toHaveBeenCalled();
  });
  it('uses platform-scoped detail and registration lookups', async () => {
    const f = fixture();
    const report = await f.service.detail('logical', 7);
    expect(report.periodDays).toBe(7);
    expect(f.prisma.model.findFirst.mock.calls[0][0].where).toEqual({
      id: 'logical',
      isDeleted: false,
      organizationId: null,
    });
    expect(
      f.prisma.model.findMany.mock.calls[0][0].where.organizationId,
    ).toBeNull();
  });
});
