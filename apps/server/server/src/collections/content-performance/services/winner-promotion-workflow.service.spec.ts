import { WinnerPromotionWorkflowService } from '@server/collections/content-performance/services/winner-promotion-workflow.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('WinnerPromotionWorkflowService', () => {
  const logger = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const cacheService = {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  };
  const prisma = {
    brand: { findMany: vi.fn() },
    credential: { findMany: vi.fn() },
  };
  const harnessWinnerPromotionService = {
    promoteTopPerformers: vi.fn(),
  };

  let service: WinnerPromotionWorkflowService;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheService.acquireLock.mockResolvedValue(true);
    cacheService.releaseLock.mockResolvedValue(undefined);
    prisma.credential.findMany.mockResolvedValue([
      { brandId: 'brand-1' },
      { brandId: 'brand-2' },
    ]);
    prisma.brand.findMany.mockResolvedValue([
      { id: 'brand-1' },
      { id: 'brand-2' },
    ]);
    harnessWinnerPromotionService.promoteTopPerformers.mockResolvedValue({
      contextBaseId: 'ctx-1',
      promoted: 2,
      skipped: 0,
    });

    service = new WinnerPromotionWorkflowService(
      prisma as never,
      logger as never,
      cacheService as never,
      harnessWinnerPromotionService as never,
    );
  });

  it('skips when the org window lock is already held', async () => {
    cacheService.acquireLock.mockResolvedValue(false);

    const result = await service.runOrganizationWinnerPromotion('org-1');

    expect(result).toMatchObject({
      action: 'harnessWinnerPromotionSweep',
      reason: 'winner_promotion_already_running',
      status: 'skipped',
    });
    expect(prisma.credential.findMany).not.toHaveBeenCalled();
  });

  it('skips when the harness winner promotion service is unavailable', async () => {
    service = new WinnerPromotionWorkflowService(
      prisma as never,
      logger as never,
      cacheService as never,
      undefined,
      { get: () => undefined } as never,
    );

    const result = await service.runOrganizationWinnerPromotion('org-1');

    expect(result).toMatchObject({
      reason: 'harness_winner_promotion_service_unavailable',
      status: 'skipped',
    });
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });

  it('promotes top performers for every active brand with a connected credential', async () => {
    const result = await service.runOrganizationWinnerPromotion('org-1');

    expect(prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ['brandId'],
        where: expect.objectContaining({
          brandId: { not: null },
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(prisma.brand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['brand-1', 'brand-2'] },
          isActive: true,
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(
      harnessWinnerPromotionService.promoteTopPerformers,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
    expect(
      harnessWinnerPromotionService.promoteTopPerformers,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'brand-2', organizationId: 'org-1' }),
    );
    expect(result).toMatchObject({
      brandsEligible: 2,
      brandsFailed: 0,
      brandsPromoted: 2,
      organizationId: 'org-1',
      promoted: 4,
      status: 'completed',
    });
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });

  it('isolates a single brand failure and keeps sweeping the rest', async () => {
    harnessWinnerPromotionService.promoteTopPerformers
      .mockRejectedValueOnce(new Error('provider timeout'))
      .mockResolvedValueOnce({
        contextBaseId: 'ctx-2',
        promoted: 1,
        skipped: 0,
      });

    const result = await service.runOrganizationWinnerPromotion('org-1');

    expect(result).toMatchObject({
      brandsEligible: 2,
      brandsFailed: 1,
      brandsPromoted: 1,
      promoted: 1,
      status: 'completed',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('brand winner promotion failed'),
      expect.objectContaining({ brandId: 'brand-1', organizationId: 'org-1' }),
    );
  });

  it('returns no eligible brands when nothing has a connected credential', async () => {
    prisma.credential.findMany.mockResolvedValue([]);

    const result = await service.runOrganizationWinnerPromotion('org-1');

    expect(prisma.brand.findMany).not.toHaveBeenCalled();
    expect(
      harnessWinnerPromotionService.promoteTopPerformers,
    ).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      brandsEligible: 0,
      status: 'completed',
    });
  });

  it('always releases the lock, even when the sweep throws', async () => {
    prisma.credential.findMany.mockRejectedValue(new Error('db unavailable'));

    await expect(
      service.runOrganizationWinnerPromotion('org-1'),
    ).rejects.toThrow('db unavailable');
    expect(cacheService.releaseLock).toHaveBeenCalled();
  });
});
