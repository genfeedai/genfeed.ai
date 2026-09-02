import {
  type PerformanceContentItem,
  PerformanceSummaryService,
} from '@api/collections/content-performance/services/performance-summary.service';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isXPlatform, scoreXPublicMetricsPer1k } from '@genfeedai/harness';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable, Optional, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

export type PromoteWinnersParams = {
  brandId: string;
  organizationId: string;
  /** Max winners to promote this run. */
  limit?: number;
  platform?: string;
};

export type PromoteWinnersResult = {
  contextBaseId: string;
  promoted: number;
  skipped: number;
};

export type WinnerPromotionCandidate = {
  content: string;
  item: PerformanceContentItem;
};

/**
 * Promotes high-engagement posts into the brand performance-winners context
 * base. Entries are embedded on write (Postgres pgvector) so generation can
 * retrieve them by topic for brand-native content context.
 */
@Injectable()
export class HarnessWinnerPromotionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly performanceSummaryService?: PerformanceSummaryService,
    @Optional()
    private readonly contextsService?: ContextsService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  async discoverTopPerformers(params: PromoteWinnersParams): Promise<{
    contextBaseId: string;
    items: WinnerPromotionCandidate[];
    skipped: number;
  }> {
    const limit = params.limit ?? 5;
    const performanceSummaryService = this.resolveProvider(
      this.performanceSummaryService,
      PerformanceSummaryService,
    );
    if (!performanceSummaryService) {
      throw new Error('Performance summary service is unavailable');
    }
    const summary = await performanceSummaryService.getWeeklySummary(
      params.organizationId,
      params.brandId,
      { topN: limit, worstN: 0 },
    );

    let performers = summary.topPerformers ?? [];
    if (params.platform) {
      const platform = params.platform.toLowerCase();
      performers = performers.filter((item) =>
        String(item.platform ?? '')
          .toLowerCase()
          .includes(platform),
      );
    }

    // When ranking X posts, prefer algo-inspired public-metric weights
    // (conversation/saves > likes) over flat engagement rate order.
    performers = this.rankPerformersForPromotion(performers);

    const contextBase = await this.ensureWinnersContextBase(
      params.organizationId,
      params.brandId,
    );

    const seenContent = new Set<string>();
    const seenPostIds = new Set<string>();
    const boundedPerformers = performers.slice(0, limit);
    const items = boundedPerformers.flatMap((item) => {
      const content = this.describePerformer(item);
      if (!content) return [];
      const postId = item.postId;
      if (
        seenContent.has(content) ||
        (postId !== undefined && seenPostIds.has(postId))
      ) {
        return [];
      }
      seenContent.add(content);
      if (postId !== undefined) seenPostIds.add(postId);
      return [{ content, item }];
    });
    return {
      contextBaseId: contextBase.id,
      items,
      skipped: boundedPerformers.length - items.length,
    };
  }

  async promoteTopPerformer(
    organizationId: string,
    contextBaseId: string,
    candidate: WinnerPromotionCandidate,
  ): Promise<{ promoted: number; skipped: number }> {
    const postId = candidate.item.postId;
    const already = await this.findExistingWinnerEntry(
      contextBaseId,
      organizationId,
      postId,
      candidate.content,
    );
    if (already) return { promoted: 0, skipped: 1 };
    const contextsService = this.resolveProvider(
      this.contextsService,
      ContextsService,
    );
    if (contextsService) {
      await contextsService.addEntry(
        contextBaseId,
        {
          content: candidate.content,
          metadata: {
            engagementRate: candidate.item.engagementRate,
            kind: 'performance_winner',
            platform: candidate.item.platform,
            postId,
            promotedAt: new Date().toISOString(),
            source: 'harness-winner-promotion',
          },
          relevanceWeight: 1,
        },
        organizationId,
      );
    } else {
      await this.prisma.contextEntry.create({
        data: {
          contextBaseId,
          data: {
            content: candidate.content,
            kind: 'performance_winner',
            metadata: {
              engagementRate: candidate.item.engagementRate,
              kind: 'performance_winner',
              platform: candidate.item.platform,
              postId,
              promotedAt: new Date().toISOString(),
              source: 'harness-winner-promotion',
            },
            relevanceWeight: 1,
          } as Prisma.InputJsonValue,
          organizationId,
        },
      });
    }
    return { promoted: 1, skipped: 0 };
  }

  private async ensureWinnersContextBase(
    organizationId: string,
    brandId: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.contextBase.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, {
        AND: [
          { data: { equals: brandId, path: ['brandId'] } },
          {
            data: {
              equals: 'harness-performance-winners',
              path: ['purpose'],
            },
          },
        ],
      }),
    });
    if (existing) {
      return existing;
    }

    return this.prisma.contextBase.create({
      data: {
        data: {
          brandId,
          isActive: true,
          label: 'Harness performance winners',
          purpose: 'harness-performance-winners',
          // Enables enhancePrompt / content-library style filters.
          type: 'content_library',
        } as Prisma.InputJsonValue,
        isDeleted: false,
        organizationId,
        sourceBrandId: brandId,
      },
      select: { id: true },
    });
  }

  private async findExistingWinnerEntry(
    contextBaseId: string,
    organizationId: string,
    postId: string | undefined,
    content: string,
  ): Promise<boolean> {
    const entries = await this.prisma.contextEntry.findMany({
      select: { data: true },
      take: 100,
      where: scopedWhere(organizationId, {
        contextBaseId,
        isDeleted: false,
      }),
    });

    return entries.some((entry) => {
      const data =
        entry.data &&
        typeof entry.data === 'object' &&
        !Array.isArray(entry.data)
          ? (entry.data as Record<string, unknown>)
          : {};
      const metadata =
        data.metadata &&
        typeof data.metadata === 'object' &&
        !Array.isArray(data.metadata)
          ? (data.metadata as Record<string, unknown>)
          : {};
      if (postId && metadata.postId === postId) {
        return true;
      }
      return data.content === content;
    });
  }

  private describePerformer(item: PerformanceContentItem): string {
    const text = (item.title || item.description || '').trim();
    if (!text) {
      return '';
    }
    const rate =
      typeof item.engagementRate === 'number'
        ? ` (${item.engagementRate.toFixed(2)}% engagement)`
        : '';
    const platform = item.platform ? ` on ${item.platform}` : '';
    const xScore = isXPlatform(item.platform)
      ? ` [x-score ${scoreXPublicMetricsPer1k({
          ...item,
          authorClosedLoops: readAuthorClosedLoops(item),
        }).toFixed(1)}/1k]`
      : '';
    return `Winning post${platform}${rate}${xScore}: ${text.slice(0, 400)}`;
  }

  private resolveProvider<T>(
    direct: T | undefined,
    token: Type<T>,
  ): T | undefined {
    if (direct) {
      return direct;
    }
    try {
      return this.moduleRef?.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }

  /**
   * Re-order top performers so X posts use Heavy-Ranker-inspired public metrics
   * (comments/saves weighted higher than likes). Non-X order is unchanged.
   */
  private rankPerformersForPromotion(
    performers: PerformanceContentItem[],
  ): PerformanceContentItem[] {
    const hasX = performers.some((item) => isXPlatform(item.platform));
    if (!hasX) {
      return performers;
    }

    return [...performers].sort((left, right) => {
      const leftIsX = isXPlatform(left.platform);
      const rightIsX = isXPlatform(right.platform);
      if (leftIsX && rightIsX) {
        const leftScore = scoreXPublicMetricsPer1k({
          ...left,
          authorClosedLoops: readAuthorClosedLoops(left),
        });
        const rightScore = scoreXPublicMetricsPer1k({
          ...right,
          authorClosedLoops: readAuthorClosedLoops(right),
        });
        return rightScore - leftScore;
      }
      if (leftIsX !== rightIsX) {
        return leftIsX ? -1 : 1;
      }
      return (right.engagementRate ?? 0) - (left.engagementRate ?? 0);
    });
  }
}

function readAuthorClosedLoops(item: PerformanceContentItem): number {
  const record = item as PerformanceContentItem & {
    authorClosedLoops?: number;
    data?: { authorClosedLoops?: number };
  };
  if (typeof record.authorClosedLoops === 'number') {
    return record.authorClosedLoops;
  }
  if (typeof record.data?.authorClosedLoops === 'number') {
    return record.data.authorClosedLoops;
  }
  return 0;
}
