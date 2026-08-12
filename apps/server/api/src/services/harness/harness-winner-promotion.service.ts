import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import {
  type PerformanceContentItem,
  PerformanceSummaryService,
} from '@server/collections/content-performance/services/performance-summary.service';

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

/**
 * Promotes high-engagement posts into a brand "performance winners" context
 * base as structured entries (kind performance_winner). Embeddings are
 * optional later; this is the durable promotion step without a RAG product.
 */
@Injectable()
export class HarnessWinnerPromotionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly performanceSummaryService: PerformanceSummaryService,
  ) {}

  async promoteTopPerformers(
    params: PromoteWinnersParams,
  ): Promise<PromoteWinnersResult> {
    const limit = params.limit ?? 5;
    const summary = await this.performanceSummaryService.getWeeklySummary(
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

    const contextBase = await this.ensureWinnersContextBase(
      params.organizationId,
      params.brandId,
    );

    let promoted = 0;
    let skipped = 0;

    for (const item of performers.slice(0, limit)) {
      const content = this.describePerformer(item);
      if (!content) {
        skipped += 1;
        continue;
      }

      const postId = item.postId;

      const already = await this.findExistingWinnerEntry(
        contextBase.id,
        params.organizationId,
        postId,
        content,
      );
      if (already) {
        skipped += 1;
        continue;
      }

      await this.prisma.contextEntry.create({
        data: {
          contextBaseId: contextBase.id,
          data: {
            content,
            kind: 'performance_winner',
            metadata: {
              engagementRate: item.engagementRate,
              platform: item.platform,
              postId,
              promotedAt: new Date().toISOString(),
              source: 'harness-winner-promotion',
            },
            relevanceWeight: 1,
          } as never,
          organizationId: params.organizationId,
        },
      });
      promoted += 1;
    }

    this.logger.log(`${this.constructorName} promoted winners`, {
      brandId: params.brandId,
      contextBaseId: contextBase.id,
      organizationId: params.organizationId,
      promoted,
      skipped,
    });

    return {
      contextBaseId: contextBase.id,
      promoted,
      skipped,
    };
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
          label: 'Harness performance winners',
          purpose: 'harness-performance-winners',
        } as never,
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
    return `Winning post${platform}${rate}: ${text.slice(0, 400)}`;
  }
}
