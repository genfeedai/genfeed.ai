import {
  CampaignPerformanceService,
  rollupCampaignMetric,
} from '@api/collections/campaigns/services/campaign-performance.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = 'org-1';
const BRAND_ID = 'cbrand0000001';
const CAMPAIGN_ID = 'ccampaign0001';

function asMock(fn: unknown) {
  return fn as ReturnType<typeof vi.fn>;
}

describe('rollupCampaignMetric', () => {
  it('returns null when no member post has provider data', () => {
    expect(rollupCampaignMetric(3, [])).toEqual({
      availablePostCount: 0,
      totalPostCount: 3,
      value: null,
    });
  });

  it('sums measured zeros without turning missing siblings into zero', () => {
    expect(rollupCampaignMetric(2, [0])).toEqual({
      availablePostCount: 1,
      totalPostCount: 2,
      value: 0,
    });
  });
});

describe('CampaignPerformanceService', () => {
  const prisma = {
    campaign: { findFirst: vi.fn() },
    post: { findMany: vi.fn() },
    postAnalytics: { findMany: vi.fn() },
  } as unknown as PrismaService;
  let service: CampaignPerformanceService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new CampaignPerformanceService(prisma);
  });

  it('keeps campaign views unavailable when no post has analytics rows', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue({
      brandId: BRAND_ID,
      id: CAMPAIGN_ID,
    });
    asMock(prisma.post.findMany).mockResolvedValue([
      {
        id: 'cpost00000001',
        platform: 'instagram',
        targetExecutionState: 'published',
      },
      { id: 'cpost00000002', platform: 'x', targetExecutionState: 'draft' },
    ]);
    asMock(prisma.postAnalytics.findMany).mockResolvedValue([]);

    const result = await service.getPerformance(ORG_ID, CAMPAIGN_ID);

    expect(result.organic.views.value).toBeNull();
    expect(result.organic.views.availablePostCount).toBe(0);
    expect(result.organic.clicks.value).toBeNull();
    expect(result.posts[0]?.views).toBeNull();
    expect(result.postCounts).toEqual({ published: 1, draft: 1 });
  });

  it('sums only posts that have analytics in the window', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue({
      brandId: BRAND_ID,
      id: CAMPAIGN_ID,
    });
    asMock(prisma.post.findMany).mockResolvedValue([
      {
        id: 'cpost00000001',
        platform: 'instagram',
        targetExecutionState: 'published',
      },
      { id: 'cpost00000002', platform: 'x', targetExecutionState: 'published' },
    ]);
    asMock(prisma.postAnalytics.findMany).mockResolvedValue([
      {
        postId: 'cpost00000001',
        platform: 'INSTAGRAM',
        totalComments: 1,
        totalLikes: 4,
        totalSaves: 0,
        totalShares: 2,
        totalViews: 50,
      },
    ]);

    const result = await service.getPerformance(ORG_ID, CAMPAIGN_ID, {
      endDate: '2026-09-02',
      startDate: '2026-08-26',
    });

    expect(result.organic.views).toEqual({
      availablePostCount: 1,
      totalPostCount: 2,
      value: 50,
    });
    expect(result.organic.engagements.value).toBe(7);
    expect(result.posts[0]?.views).toBe(50);
    expect(result.posts[1]?.views).toBeNull();
    expect(result.byPlatform[0]?.platform).toBe('instagram');
  });

  it('rejects a missing campaign', async () => {
    asMock(prisma.campaign.findFirst).mockResolvedValue(null);
    await expect(
      service.getPerformance(ORG_ID, CAMPAIGN_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
