import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('MediaVendorCostLedgerService', () => {
  const prisma = {
    mediaVendorCost: {
      create: vi.fn().mockResolvedValue(undefined),
      groupBy: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
  };

  let service: MediaVendorCostLedgerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MediaVendorCostLedgerService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    );
  });

  it('persists one ledger row per generation', async () => {
    await service.record({
      brandId: 'brand-1',
      category: 'video',
      ingredientId: 'ing-1',
      isByok: false,
      model: 'bytedance/seedance-2.5',
      organizationId: 'org-1',
      pricingType: 'per-second',
      provider: 'replicate',
      units: 10,
      vendorCostMicros: 2_400_000,
    });

    expect(prisma.mediaVendorCost.upsert).toHaveBeenCalledWith({
      create: {
        brandId: 'brand-1',
        category: 'video',
        idempotencyKey: 'media:org-1:ing-1',
        ingredientId: 'ing-1',
        isByok: false,
        isDeleted: false,
        model: 'bytedance/seedance-2.5',
        organizationId: 'org-1',
        pricingType: 'per-second',
        provider: 'replicate',
        units: 10,
        vendorCostMicros: 2_400_000,
      },
      update: {},
      where: {
        idempotencyKey: 'media:org-1:ing-1',
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });

  it('aggregates by org and date range with the tenant filter', async () => {
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-17T00:00:00Z');

    await service.aggregateByOrgModel({ from, organizationId: 'org-1', to });

    expect(prisma.mediaVendorCost.groupBy).toHaveBeenCalledWith({
      _count: { _all: true },
      _sum: { units: true, vendorCostMicros: true },
      by: ['model', 'provider', 'isByok'],
      where: {
        createdAt: { gte: from, lte: to },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
  });
});
