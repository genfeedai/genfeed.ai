import { VariationGroupScoringService } from '@api/collections/content-performance/services/variation-group-scoring.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationId = 'org-1';
const brandId = 'brand-1';

// Group "group-1": p1 and p2 have performance rows, p3 has none — excluded
// from scoring, group still valid because 2 scored members remain.
const posts = [
  {
    brandId,
    format: 'social-image-creative',
    generationId: 'group-1',
    groupId: 'group-1',
    id: 'p1',
    organizationId,
    platform: 'instagram',
    targetExecutionState: TargetExecutionState.PUBLISHED,
    variantId: 'v1',
  },
  {
    brandId,
    format: 'post-thread',
    generationId: 'group-1',
    groupId: 'group-1',
    id: 'p2',
    organizationId,
    platform: 'twitter',
    targetExecutionState: TargetExecutionState.PUBLISHED,
    variantId: 'v2',
  },
  {
    brandId,
    format: 'reel',
    generationId: 'group-1',
    groupId: 'group-1',
    id: 'p3',
    organizationId,
    platform: 'instagram',
    targetExecutionState: TargetExecutionState.PUBLISHED,
    variantId: 'v3',
  },
  // Group "group-2": only p4 has performance data; p5 is unscored, so fewer
  // than 2 scored members remain — the whole group is excluded.
  {
    brandId,
    format: 'standard',
    generationId: 'group-2',
    groupId: 'group-2',
    id: 'p4',
    organizationId,
    platform: 'linkedin',
    targetExecutionState: TargetExecutionState.PUBLISHED,
    variantId: 'v4',
  },
  {
    brandId,
    format: 'standard',
    generationId: 'group-2',
    groupId: 'group-2',
    id: 'p5',
    organizationId,
    platform: 'linkedin',
    targetExecutionState: TargetExecutionState.PUBLISHED,
    variantId: 'v5',
  },
];

const performanceRows = [
  { engagementRate: 8, performanceScore: 90, postId: 'p1', views: 500 },
  { engagementRate: 6, performanceScore: 70, postId: 'p1', views: 300 },
  { engagementRate: 2, performanceScore: 40, postId: 'p2', views: 100 },
  { engagementRate: 5, performanceScore: 60, postId: 'p4', views: 50 },
];

function createHarness() {
  const find = vi.fn().mockResolvedValue(posts);
  const postsService = { find } as unknown as PostsService;

  const findMany = vi.fn().mockResolvedValue(performanceRows);
  const prisma = {
    contentPerformance: { findMany },
  } as unknown as PrismaService;

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const service = new VariationGroupScoringService(
    postsService,
    prisma,
    logger,
  );

  return { find, findMany, logger, postsService, prisma, service };
}

describe('VariationGroupScoringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the post lookup to the organization (and brand, when given)', async () => {
    const { find, service } = createHarness();

    await service.scoreVariationGroups({ brandId, organizationId });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId,
        groupId: { not: null },
        isDeleted: false,
        organizationId,
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    );
  });

  it('omits the brand filter when no brandId is given', async () => {
    const { find, service } = createHarness();

    await service.scoreVariationGroups({ organizationId });

    const [where] = find.mock.calls[0];
    expect(where.brandId).toBeUndefined();
    expect(where.organizationId).toBe(organizationId);
  });

  it('scopes the content_performance lookup to the organization', async () => {
    const { findMany, service } = createHarness();

    await service.scoreVariationGroups({ organizationId });

    expect(findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isDeleted: false,
        organizationId,
        postId: { in: ['p1', 'p2', 'p3', 'p4', 'p5'] },
      }),
    });
  });

  it('excludes groups with fewer than 2 scored members', async () => {
    const { service } = createHarness();

    const result = await service.scoreVariationGroups({ organizationId });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.groupId).toBe('group-1');
  });

  it('excludes unscored posts from a valid group but keeps the group', async () => {
    const { service } = createHarness();

    const result = await service.scoreVariationGroups({ organizationId });

    const group = result.groups.find((g) => g.groupId === 'group-1');
    expect(group?.scores).toHaveLength(2);
    expect(group?.scores.map((s) => s.postId).sort()).toEqual(['p1', 'p2']);
  });

  it('applies the canonical weighting and ranks scored posts descending', async () => {
    const { service } = createHarness();

    const result = await service.scoreVariationGroups({ organizationId });
    const group = result.groups.find((g) => g.groupId === 'group-1');
    const [first, second] = group?.scores ?? [];

    // p1: avgPerformanceScore 80, avgEngagementRate 7, totalViews 800
    //   = 80*0.6 + min(70,100)*0.3 + min(log10(801)*10,30)*0.1
    //   = 48 + 21 + 2.9034 = 71.9034
    expect(first?.postId).toBe('p1');
    expect(first?.rank).toBe(1);
    expect(first?.score).toBeCloseTo(71.9034, 3);

    // p2: avgPerformanceScore 40, avgEngagementRate 2, totalViews 100
    //   = 40*0.6 + min(20,100)*0.3 + min(log10(101)*10,30)*0.1
    //   = 24 + 6 + 2.0043 = 32.0043
    expect(second?.postId).toBe('p2');
    expect(second?.rank).toBe(2);
    expect(second?.score).toBeCloseTo(32.0043, 3);
  });

  it('picks the top-ranked scored post as the group winner', async () => {
    const { service } = createHarness();

    const result = await service.scoreVariationGroups({ organizationId });
    const group = result.groups.find((g) => g.groupId === 'group-1');

    expect(group?.winner.postId).toBe('p1');
    expect(group?.winner.variantId).toBe('v1');
  });

  it('applies a sinceDays cutoff to publishedAt when given', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T00:00:00.000Z'));

    const { find, service } = createHarness();
    await service.scoreVariationGroups({ organizationId, sinceDays: 14 });

    const [where] = find.mock.calls[0];
    expect(where.publishedAt).toEqual({
      gte: new Date('2026-08-03T00:00:00.000Z'),
    });

    vi.useRealTimers();
  });

  it('returns no groups and skips the performance lookup when there are no published variation posts', async () => {
    const { find, findMany, service } = createHarness();
    find.mockResolvedValueOnce([]);

    const result = await service.scoreVariationGroups({ organizationId });

    expect(result.groups).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
