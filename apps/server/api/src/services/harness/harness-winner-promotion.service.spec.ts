import { HarnessWinnerPromotionService } from '@api/services/harness/harness-winner-promotion.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('HarnessWinnerPromotionService', () => {
  const prisma = {
    contextBase: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    contextEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const logger = { log: vi.fn(), warn: vi.fn() };
  const performanceSummaryService = {
    getWeeklySummary: vi.fn(),
  };

  let service: HarnessWinnerPromotionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new HarnessWinnerPromotionService(
      prisma as never,
      logger as never,
      performanceSummaryService as never,
    );
  });

  it('creates a winners context base and promotes unique top performers', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue({
      topPerformers: [
        {
          description: '',
          engagementRate: 4.2,
          platform: 'twitter',
          postId: 'post-1',
          title: 'Ship the OS, not another wrapper.',
        },
        {
          description: '',
          engagementRate: 4.1,
          platform: 'twitter',
          postId: 'post-1',
          title: 'Ship the OS, not another wrapper.',
        },
      ],
    });
    prisma.contextBase.findFirst.mockResolvedValue(null);
    prisma.contextBase.create.mockResolvedValue({ id: 'ctx-1' });
    prisma.contextEntry.findMany.mockResolvedValue([]);
    prisma.contextEntry.create.mockResolvedValue({ id: 'entry-1' });

    const result = await service.promoteTopPerformers({
      brandId: 'brand-1',
      organizationId: 'org-1',
      limit: 5,
    });

    expect(prisma.contextBase.create).toHaveBeenCalled();
    expect(prisma.contextEntry.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      contextBaseId: 'ctx-1',
      promoted: 1,
      skipped: 1,
    });
  });

  it('skips when the performer has no text', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue({
      topPerformers: [{ engagementRate: 9, postId: 'post-empty' }],
    });
    prisma.contextBase.findFirst.mockResolvedValue({ id: 'ctx-1' });
    prisma.contextEntry.findMany.mockResolvedValue([]);

    const result = await service.promoteTopPerformers({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(prisma.contextEntry.create).not.toHaveBeenCalled();
    expect(result.promoted).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
