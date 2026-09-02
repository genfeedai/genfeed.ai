import {
  computeVariantPerformanceScore,
  rankByScoreDesc,
} from '@api/collections/content-performance/utils/variant-performance-scoring.util';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

// A source-post variation group needs at least 2 scored members for a
// score comparison ("winner") to be meaningful (issue #3025).
const MIN_SCORED_GROUP_SIZE = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ScoreVariationGroupsParams {
  organizationId: string;
  brandId?: string;
  /** Only include posts published within the last N days. */
  sinceDays?: number;
}

export interface VariationGroupPostScore {
  avgEngagementRate: number;
  avgPerformanceScore: number;
  format?: string;
  generationId?: string;
  /** The post's label or description — the closest analog to a run's "hook". */
  hook?: string;
  platform?: string;
  postId: string;
  rank: number;
  score: number;
  totalRecords: number;
  totalViews: number;
  variantId?: string;
}

export interface VariationGroupScore {
  groupId: string;
  scores: VariationGroupPostScore[];
  winner: VariationGroupPostScore;
}

export interface VariationGroupScoringResult {
  groups: VariationGroupScore[];
}

type PerformanceRow = {
  engagementRate?: number | null;
  performanceScore?: number | null;
  postId?: string | null;
  views?: number | null;
};

type PostAccumulator = {
  format?: string;
  generationId?: string;
  groupId: string;
  hook?: string;
  platform?: string;
  postId: string;
  totalEngagementRate: number;
  totalPerformanceScore: number;
  totalRecords: number;
  totalViews: number;
  variantId?: string;
};

/**
 * Scores published source-post variation groups (`Post.groupId`, #2662)
 * against their post-publish `content_performance` rows, so a group's
 * winning variant can be identified after the fact (issue #3025).
 *
 * Reuses the canonical scoring weighting from
 * `variant-performance-scoring.util` — see that file for the formula and
 * its canonical source (`ContentRunRecommendationsService`, issue #166).
 */
@Injectable()
export class VariationGroupScoringService {
  private readonly logContext = 'VariationGroupScoringService';

  constructor(
    private readonly postsService: PostsService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private readNumber(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private sinceDaysCutoff(sinceDays: number | undefined): Date | undefined {
    if (!sinceDays || sinceDays <= 0) {
      return undefined;
    }
    return new Date(Date.now() - sinceDays * MS_PER_DAY);
  }

  private async findPublishedVariationPosts(
    params: ScoreVariationGroupsParams,
  ): Promise<PostDocument[]> {
    const cutoff = this.sinceDaysCutoff(params.sinceDays);

    return this.postsService.find(
      scopedWhere(params.organizationId, {
        ...(params.brandId ? { brandId: params.brandId } : {}),
        groupId: { not: null },
        ...(cutoff ? { publishedAt: { gte: cutoff } } : {}),
        targetExecutionState: TargetExecutionState.PUBLISHED,
      }),
    );
  }

  private async findPerformanceRows(
    organizationId: string,
    postIds: string[],
  ): Promise<PerformanceRow[]> {
    return (await this.prisma.contentPerformance.findMany({
      where: scopedWhere(organizationId, { postId: { in: postIds } }),
    })) as PerformanceRow[];
  }

  private buildPostAccumulators(
    posts: PostDocument[],
    rows: PerformanceRow[],
  ): Map<string, PostAccumulator> {
    const accumulators = new Map<string, PostAccumulator>();

    for (const post of posts) {
      const groupId = this.readString(post.groupId as string | null);
      if (!groupId) {
        continue;
      }
      accumulators.set(post.id, {
        format: this.readString(post.format as string | null),
        generationId: this.readString(post.generationId as string | null),
        groupId,
        hook:
          this.readString(post.label as string | null) ??
          this.readString(post.description as string | null),
        platform: this.readString(post.platform as string | null),
        postId: post.id,
        totalEngagementRate: 0,
        totalPerformanceScore: 0,
        totalRecords: 0,
        totalViews: 0,
        variantId: this.readString(post.variantId as string | null),
      });
    }

    for (const row of rows) {
      const postId = this.readString(row.postId);
      if (!postId) {
        continue;
      }
      const accumulator = accumulators.get(postId);
      if (!accumulator) {
        continue;
      }
      accumulator.totalEngagementRate += this.readNumber(row.engagementRate);
      accumulator.totalPerformanceScore += this.readNumber(
        row.performanceScore,
      );
      accumulator.totalViews += this.readNumber(row.views);
      accumulator.totalRecords += 1;
    }

    return accumulators;
  }

  private scoreAccumulator(
    accumulator: PostAccumulator,
  ): Omit<VariationGroupPostScore, 'rank'> {
    const avgEngagementRate =
      accumulator.totalEngagementRate / Math.max(accumulator.totalRecords, 1);
    const avgPerformanceScore =
      accumulator.totalPerformanceScore / Math.max(accumulator.totalRecords, 1);

    return {
      avgEngagementRate,
      avgPerformanceScore,
      format: accumulator.format,
      generationId: accumulator.generationId,
      hook: accumulator.hook,
      platform: accumulator.platform,
      postId: accumulator.postId,
      score: computeVariantPerformanceScore({
        avgEngagementRate,
        avgPerformanceScore,
        totalViews: accumulator.totalViews,
      }),
      totalRecords: accumulator.totalRecords,
      totalViews: accumulator.totalViews,
      variantId: accumulator.variantId,
    };
  }

  async scoreVariationGroups(
    params: ScoreVariationGroupsParams,
  ): Promise<VariationGroupScoringResult> {
    const caller = `${this.logContext}.scoreVariationGroups`;
    const posts = await this.findPublishedVariationPosts(params);

    if (posts.length === 0) {
      this.logger.debug(`${caller} no published variation posts found`, {
        brandId: params.brandId,
        organizationId: params.organizationId,
      });
      return { groups: [] };
    }

    const postIds = posts.map((post) => post.id);
    const rows = await this.findPerformanceRows(params.organizationId, postIds);
    const accumulators = this.buildPostAccumulators(posts, rows);

    const byGroup = new Map<string, PostAccumulator[]>();
    for (const accumulator of accumulators.values()) {
      // Only posts with at least one performance record are comparable.
      if (accumulator.totalRecords === 0) {
        continue;
      }
      const members = byGroup.get(accumulator.groupId) ?? [];
      members.push(accumulator);
      byGroup.set(accumulator.groupId, members);
    }

    const groups: VariationGroupScore[] = [];
    for (const [groupId, members] of byGroup) {
      if (members.length < MIN_SCORED_GROUP_SIZE) {
        continue;
      }
      const scores = rankByScoreDesc(
        members.map((member) => this.scoreAccumulator(member)),
      );
      const winner = scores[0];
      if (!winner) {
        continue;
      }
      groups.push({ groupId, scores, winner });
    }

    this.logger.log(caller, {
      brandId: params.brandId,
      groupCount: groups.length,
      organizationId: params.organizationId,
      scoredPostCount: postIds.length,
    });

    return { groups };
  }
}
