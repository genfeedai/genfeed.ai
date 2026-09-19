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
  const performanceSummaryService = {
    getWeeklySummary: vi.fn(),
  };
  const contextsService = {
    addEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
  };

  let service: HarnessWinnerPromotionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new HarnessWinnerPromotionService(
      prisma as never,
      performanceSummaryService as never,
      contextsService as never,
    );
  });

  async function executeAtomicWinnerBatch(
    input: Parameters<
      HarnessWinnerPromotionService['discoverTopPerformers']
    >[0],
  ) {
    const discovery = await service.discoverTopPerformers(input);
    const results = [];
    for (const candidate of discovery.items) {
      results.push(
        await service.promoteTopPerformer(
          input.organizationId,
          discovery.contextBaseId,
          candidate,
        ),
      );
    }
    return {
      contextBaseId: discovery.contextBaseId,
      promoted: results.reduce((total, result) => total + result.promoted, 0),
      skipped:
        discovery.skipped +
        results.reduce((total, result) => total + result.skipped, 0),
    };
  }

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

    const result = await executeAtomicWinnerBatch({
      brandId: 'brand-1',
      organizationId: 'org-1',
      limit: 5,
    });

    expect(prisma.contextBase.create).toHaveBeenCalled();
    expect(contextsService.addEntry).toHaveBeenCalledTimes(1);
    expect(contextsService.addEntry).toHaveBeenCalledWith(
      'ctx-1',
      expect.objectContaining({
        content: expect.stringContaining('Ship the OS'),
        metadata: expect.objectContaining({
          kind: 'performance_winner',
          postId: 'post-1',
        }),
      }),
      'org-1',
    );
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

    const result = await executeAtomicWinnerBatch({
      brandId: 'brand-1',
      organizationId: 'org-1',
    });

    expect(prisma.contextEntry.create).not.toHaveBeenCalled();
    expect(result.promoted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('prefers high-conversation X posts over like-farming when promoting', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue({
      topPerformers: [
        {
          comments: 0,
          description: '',
          engagementRate: 12,
          likes: 500,
          platform: 'twitter',
          postId: 'like-farm',
          saves: 0,
          shares: 0,
          title: 'Like farm post with huge vanity likes',
          views: 10_000,
        },
        {
          comments: 40,
          description: '',
          engagementRate: 3,
          likes: 20,
          platform: 'twitter',
          postId: 'conversation',
          saves: 15,
          shares: 8,
          title: 'Conversation magnet with real replies',
          views: 5000,
        },
      ],
    });
    prisma.contextBase.findFirst.mockResolvedValue({ id: 'ctx-1' });
    prisma.contextEntry.findMany.mockResolvedValue([]);

    await executeAtomicWinnerBatch({
      brandId: 'brand-1',
      organizationId: 'org-1',
      limit: 1,
    });

    expect(contextsService.addEntry).toHaveBeenCalledTimes(1);
    expect(contextsService.addEntry).toHaveBeenCalledWith(
      'ctx-1',
      expect.objectContaining({
        content: expect.stringContaining('Conversation magnet'),
        metadata: expect.objectContaining({ postId: 'conversation' }),
      }),
      'org-1',
    );
  });

  it('ranks author closed loops above raw likes via the Heavy Ranker weight', async () => {
    performanceSummaryService.getWeeklySummary.mockResolvedValue({
      topPerformers: [
        {
          comments: 5,
          data: { authorClosedLoops: 0 },
          description: '',
          engagementRate: 10,
          likes: 500,
          platform: 'twitter',
          postId: 'like-heavy',
          saves: 2,
          shares: 2,
          title: 'Like-heavy post nobody talked back to',
          views: 10_000,
        },
        {
          comments: 6,
          data: { authorClosedLoops: 4 },
          description: '',
          engagementRate: 2,
          likes: 30,
          platform: 'twitter',
          postId: 'looped',
          saves: 3,
          shares: 1,
          title: 'Loop-rich post where the author kept replying',
          views: 10_000,
        },
      ],
    });
    prisma.contextBase.findFirst.mockResolvedValue({ id: 'ctx-1' });
    prisma.contextEntry.findMany.mockResolvedValue([]);

    await executeAtomicWinnerBatch({
      brandId: 'brand-1',
      organizationId: 'org-1',
      limit: 1,
    });

    expect(contextsService.addEntry).toHaveBeenCalledTimes(1);
    expect(contextsService.addEntry).toHaveBeenCalledWith(
      'ctx-1',
      expect.objectContaining({
        content: expect.stringContaining('Loop-rich post'),
        metadata: expect.objectContaining({ postId: 'looped' }),
      }),
      'org-1',
    );
  });

  describe('listPromotedWinners', () => {
    it('returns [] without creating a context base when the brand has no winners history', async () => {
      prisma.contextBase.findFirst.mockResolvedValue(null);

      const result = await service.listPromotedWinners({
        brandId: 'brand-1',
        from: new Date('2026-08-01T00:00:00.000Z'),
        organizationId: 'org-1',
        to: new Date('2026-08-07T23:59:59.999Z'),
      });

      expect(result).toEqual([]);
      expect(prisma.contextBase.create).not.toHaveBeenCalled();
      expect(prisma.contextEntry.findMany).not.toHaveBeenCalled();
    });

    it('scopes the read by organization and returns only entries inside the window, sorted by engagement', async () => {
      prisma.contextBase.findFirst.mockResolvedValue({ id: 'ctx-1' });
      prisma.contextEntry.findMany.mockResolvedValue([
        {
          data: {
            content:
              'Winning post on twitter (4.20% engagement): In window, lower score',
            metadata: {
              engagementRate: 4.2,
              platform: 'twitter',
              postId: 'post-1',
              promotedAt: '2026-08-03T00:00:00.000Z',
            },
          },
        },
        {
          data: {
            content:
              'Winning post on tiktok (9.10% engagement): In window, higher score',
            metadata: {
              engagementRate: 9.1,
              platform: 'tiktok',
              postId: 'post-2',
              promotedAt: '2026-08-05T00:00:00.000Z',
            },
          },
        },
        {
          data: {
            content:
              'Winning post on instagram (7.00% engagement): Outside the window',
            metadata: {
              engagementRate: 7,
              platform: 'instagram',
              postId: 'post-3',
              promotedAt: '2026-07-01T00:00:00.000Z',
            },
          },
        },
      ]);

      const result = await service.listPromotedWinners({
        brandId: 'brand-1',
        from: new Date('2026-08-01T00:00:00.000Z'),
        organizationId: 'org-1',
        to: new Date('2026-08-07T23:59:59.999Z'),
      });

      expect(prisma.contextEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contextBaseId: 'ctx-1',
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
      expect(result).toEqual([
        expect.objectContaining({ platform: 'tiktok', postId: 'post-2' }),
        expect.objectContaining({ platform: 'twitter', postId: 'post-1' }),
      ]);
    });
  });
});
