import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';

describe('MediaVendorCostLedgerService', () => {
  const prisma = {
    workflowExecution: {
      findFirst: vi.fn().mockResolvedValue({ id: 'execution-1' }),
    },
    workflowNodeContinuation: { findFirst: vi.fn().mockResolvedValue(null) },
    mediaVendorCost: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
        costEvidence: 'unknown',
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
  it('reconstructs durable callback attribution and deduplicates by output', async () => {
    prisma.workflowNodeContinuation.findFirst.mockResolvedValue({
      id: 'operation',
      executionId: 'run',
      nodeId: 'node',
    });
    await service.record({
      ingredientId: 'output',
      organizationId: 'org',
      category: 'image',
      provider: 'replicate',
      model: 'model',
      units: 1,
      vendorCostMicros: 123,
      isByok: false,
      costEvidence: 'observed',
    });
    expect(prisma.workflowNodeContinuation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ingredientId: 'output',
          organizationId: 'org',
        },
      }),
    );
    expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      where: { id: 'run', organizationId: 'org', isDeleted: false },
      select: { id: true },
    });
    expect(prisma.mediaVendorCost.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workflowExecutionId: 'run',
          workflowNodeId: 'node',
          workflowOperationId: 'operation',
          costEvidence: 'observed',
        }),
        update: {},
      }),
    );
  });
  it('settles late evidence using pinned pricing and an atomic unresolved guard', async () => {
    prisma.workflowNodeContinuation.findFirst.mockResolvedValue({
      id: 'operation',
      executionId: 'run',
      nodeId: 'node',
    });
    prisma.mediaVendorCost.findFirst.mockResolvedValue({
      pricingSnapshot: {
        providerCostUsd: 0.12,
        pricingType: 'per-second',
        isByok: false,
      },
      costEvidence: 'unknown',
    });
    await service.record({
      ingredientId: 'output',
      organizationId: 'org',
      category: 'video',
      provider: 'replicate',
      model: 'model',
      units: 999,
      realizedDurationSeconds: 2.5,
      vendorCostMicros: 9999999,
      isByok: true,
      costEvidence: 'calculated',
    });
    expect(prisma.mediaVendorCost.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        idempotencyKey: 'media:org:output',
        costEvidence: { in: ['pending', 'unknown'] },
      },
      data: {
        costEvidence: 'calculated',
        vendorCostMicros: 300000,
        units: 2.5,
        brandId: null,
        isByok: false,
      },
    });
  });
});
