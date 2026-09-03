import { NotFoundException } from '@api/exceptions/not-found.exception';
import { DateRangeUtil } from '@api/helpers/utils/date-range/date-range.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { fromPrismaCredentialPlatform } from '@genfeedai/contracts';
import type {
  ICampaignMetricAvailability,
  ICampaignOrganicTotals,
  ICampaignPerformance,
  ICampaignPerformancePlatform,
  ICampaignPerformancePost,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

export function rollupCampaignMetric(
  totalPostCount: number,
  availableValues: number[],
): ICampaignMetricAvailability {
  if (availableValues.length === 0) {
    return {
      availablePostCount: 0,
      totalPostCount,
      value: null,
    };
  }

  return {
    availablePostCount: availableValues.length,
    totalPostCount,
    value: availableValues.reduce((sum, value) => sum + value, 0),
  };
}

function emptyOrganic(totalPostCount: number): ICampaignOrganicTotals {
  const empty = rollupCampaignMetric(totalPostCount, []);
  return {
    clicks: empty,
    comments: empty,
    conversions: empty,
    engagements: empty,
    likes: empty,
    saves: empty,
    shares: empty,
    views: empty,
  };
}

@Injectable()
export class CampaignPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getPerformance(
    organizationId: string,
    id: string,
    query: { endDate?: string; startDate?: string } = {},
  ): Promise<ICampaignPerformance> {
    const campaign = await this.prisma.campaign.findFirst({
      where: scopedWhere(organizationId, { id }),
    });
    if (!campaign) {
      throw new NotFoundException('Campaign', id);
    }

    const range = DateRangeUtil.parseDateRange(query.startDate, query.endDate, {
      includePreviousPeriod: false,
    });
    const posts = await this.prisma.post.findMany({
      select: {
        id: true,
        platform: true,
        targetExecutionState: true,
      },
      where: scopedWhere(organizationId, {
        brandId: campaign.brandId,
        campaignId: campaign.id,
      }),
    });
    const postIds = posts.map((post) => post.id);
    const analytics =
      postIds.length === 0
        ? []
        : await this.prisma.postAnalytics.findMany({
            where: scopedWhere(organizationId, {
              brandId: campaign.brandId,
              date: { gte: range.startDate, lte: range.endDate },
              postId: { in: postIds },
            }),
          });

    const totalsByPost = new Map<
      string,
      {
        comments: number;
        likes: number;
        saves: number;
        shares: number;
        views: number;
      }
    >();
    for (const row of analytics) {
      const current = totalsByPost.get(row.postId) ?? {
        comments: 0,
        likes: 0,
        saves: 0,
        shares: 0,
        views: 0,
      };
      current.comments += row.totalComments;
      current.likes += row.totalLikes;
      current.saves += row.totalSaves;
      current.shares += row.totalShares;
      current.views += row.totalViews;
      totalsByPost.set(row.postId, current);
    }

    const totalPostCount = posts.length;
    const postRows: ICampaignPerformancePost[] = posts.map((post) => {
      const totals = totalsByPost.get(post.id);
      return {
        comments: totals ? totals.comments : null,
        engagementRate: null,
        id: post.id,
        likes: totals ? totals.likes : null,
        platform: post.platform,
        saves: totals ? totals.saves : null,
        shares: totals ? totals.shares : null,
        status: post.targetExecutionState,
        views: totals ? totals.views : null,
      };
    });

    const available = postRows.filter((post) => post.views !== null);
    const organic: ICampaignOrganicTotals = {
      ...emptyOrganic(totalPostCount),
      comments: rollupCampaignMetric(
        totalPostCount,
        available.map((post) => post.comments ?? 0),
      ),
      engagements: rollupCampaignMetric(
        totalPostCount,
        available.map(
          (post) =>
            (post.likes ?? 0) +
            (post.comments ?? 0) +
            (post.shares ?? 0) +
            (post.saves ?? 0),
        ),
      ),
      likes: rollupCampaignMetric(
        totalPostCount,
        available.map((post) => post.likes ?? 0),
      ),
      saves: rollupCampaignMetric(
        totalPostCount,
        available.map((post) => post.saves ?? 0),
      ),
      shares: rollupCampaignMetric(
        totalPostCount,
        available.map((post) => post.shares ?? 0),
      ),
      views: rollupCampaignMetric(
        totalPostCount,
        available.map((post) => post.views ?? 0),
      ),
    };

    const postCounts: Record<string, number> = {};
    for (const post of posts) {
      const status = post.targetExecutionState || 'unknown';
      postCounts[status] = (postCounts[status] ?? 0) + 1;
    }

    const byPlatform = this.rollupByPlatform(
      postRows,
      analytics.map((row) => ({
        platform:
          fromPrismaCredentialPlatform(row.platform) ??
          row.platform.toLowerCase(),
        postId: row.postId,
      })),
      totalPostCount,
    );

    return {
      byPlatform,
      campaignId: campaign.id,
      id: campaign.id,
      organic,
      postCounts,
      posts: postRows,
      windowEnd: range.endDate.toISOString(),
      windowStart: range.startDate.toISOString(),
    };
  }

  private rollupByPlatform(
    posts: ICampaignPerformancePost[],
    analyticsPlatforms: Array<{ platform: string; postId: string }>,
    totalPostCount: number,
  ): ICampaignPerformancePlatform[] {
    const platformByPost = new Map<string, string>();
    for (const row of analyticsPlatforms) {
      if (!platformByPost.has(row.postId)) {
        platformByPost.set(row.postId, row.platform);
      }
    }

    const grouped = new Map<string, ICampaignPerformancePost[]>();
    for (const post of posts) {
      const platform = platformByPost.get(post.id) ?? post.platform;
      if (!platform || post.views === null) {
        continue;
      }
      const current = grouped.get(platform) ?? [];
      current.push(post);
      grouped.set(platform, current);
    }

    return [...grouped.entries()].map(([platform, platformPosts]) => ({
      comments: rollupCampaignMetric(
        totalPostCount,
        platformPosts.map((post) => post.comments ?? 0),
      ),
      engagements: rollupCampaignMetric(
        totalPostCount,
        platformPosts.map(
          (post) =>
            (post.likes ?? 0) +
            (post.comments ?? 0) +
            (post.shares ?? 0) +
            (post.saves ?? 0),
        ),
      ),
      likes: rollupCampaignMetric(
        totalPostCount,
        platformPosts.map((post) => post.likes ?? 0),
      ),
      platform,
      saves: rollupCampaignMetric(
        totalPostCount,
        platformPosts.map((post) => post.saves ?? 0),
      ),
      shares: rollupCampaignMetric(
        totalPostCount,
        platformPosts.map((post) => post.shares ?? 0),
      ),
      views: rollupCampaignMetric(
        totalPostCount,
        platformPosts.map((post) => post.views ?? 0),
      ),
    }));
  }
}
