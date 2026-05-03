import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ContentRunAnalyticsSummary,
  ContentRunRecommendation,
  ContentRunVariant,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

type ContentRunRow = {
  config: unknown;
  id: string;
  status: string;
};

type PerformanceRow = {
  clicks?: number | null;
  comments?: number | null;
  contentRunId?: string | null;
  engagementRate?: number | null;
  likes?: number | null;
  performanceScore?: number | null;
  platform?: string | null;
  saves?: number | null;
  shares?: number | null;
  variantId?: string | null;
  views?: number | null;
};

export interface RunVariantScore {
  avgEngagementRate: number;
  avgPerformanceScore: number;
  contentType?: string;
  format?: string;
  platform?: string;
  rank: number;
  score: number;
  totalEngagements: number;
  totalRecords: number;
  totalViews: number;
  variantId: string;
}

export interface RunRecommendationResult {
  analyticsSummary: ContentRunAnalyticsSummary;
  recommendations: ContentRunRecommendation[];
  scores: RunVariantScore[];
  updatedRun: Record<string, unknown>;
}

type VariantAccumulator = {
  contentType?: string;
  format?: string;
  platform?: string;
  totalEngagementRate: number;
  totalEngagements: number;
  totalPerformanceScore: number;
  totalRecords: number;
  totalViews: number;
  variantId: string;
};

@Injectable()
export class ContentRunRecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private hydrateRun(run: Record<string, unknown>): Record<string, unknown> {
    const config = this.isRecord(run.config) ? run.config : {};

    return {
      ...run,
      ...config,
      _id: run.id,
      brand: run.brandId ?? config.brand,
      organization: run.organizationId ?? config.organization,
      status: run.status ?? config.status,
    };
  }

  private readConfig(run: ContentRunRow): Record<string, unknown> {
    return this.isRecord(run.config) ? run.config : {};
  }

  private readVariants(config: Record<string, unknown>): ContentRunVariant[] {
    return Array.isArray(config.variants)
      ? config.variants.filter((variant): variant is ContentRunVariant =>
          this.isRecord(variant),
        )
      : [];
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readNumber(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private getVariantId(row: PerformanceRow): string {
    return (
      this.readString(row.variantId) ??
      this.readString(
        this.isRecord((row as Record<string, unknown>).data)
          ? ((row as Record<string, unknown>).data as Record<string, unknown>)
              .variantId
          : undefined,
      ) ??
      'run-total'
    );
  }

  private buildVariantLookup(
    variants: ContentRunVariant[],
  ): Map<string, ContentRunVariant> {
    return new Map(variants.map((variant) => [variant.id, variant]));
  }

  private aggregateRows(
    rows: PerformanceRow[],
    variants: ContentRunVariant[],
  ): RunVariantScore[] {
    const variantLookup = this.buildVariantLookup(variants);
    const groups = new Map<string, VariantAccumulator>();

    for (const row of rows) {
      const variantId = this.getVariantId(row);
      const variant = variantLookup.get(variantId);
      const totalEngagements =
        this.readNumber(row.likes) +
        this.readNumber(row.comments) +
        this.readNumber(row.shares) +
        this.readNumber(row.saves) +
        this.readNumber(row.clicks);
      const current = groups.get(variantId) ?? {
        contentType: variant?.type,
        format: variant?.format,
        platform: variant?.platform ?? row.platform ?? undefined,
        totalEngagementRate: 0,
        totalEngagements: 0,
        totalPerformanceScore: 0,
        totalRecords: 0,
        totalViews: 0,
        variantId,
      };

      current.totalEngagementRate += this.readNumber(row.engagementRate);
      current.totalEngagements += totalEngagements;
      current.totalPerformanceScore += this.readNumber(row.performanceScore);
      current.totalRecords += 1;
      current.totalViews += this.readNumber(row.views);
      groups.set(variantId, current);
    }

    return [...groups.values()]
      .map((group) => {
        const avgEngagementRate =
          group.totalEngagementRate / Math.max(group.totalRecords, 1);
        const avgPerformanceScore =
          group.totalPerformanceScore / Math.max(group.totalRecords, 1);
        const engagementScore = Math.min(avgEngagementRate * 10, 100);
        const volumeScore = Math.min(Math.log10(group.totalViews + 1) * 10, 30);

        return {
          avgEngagementRate,
          avgPerformanceScore,
          contentType: group.contentType,
          format: group.format,
          platform: group.platform,
          rank: 0,
          score:
            avgPerformanceScore * 0.6 +
            engagementScore * 0.3 +
            volumeScore * 0.1,
          totalEngagements: group.totalEngagements,
          totalRecords: group.totalRecords,
          totalViews: group.totalViews,
          variantId: group.variantId,
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((score, index) => ({ ...score, rank: index + 1 }));
  }

  private buildAnalyticsSummary(
    scores: RunVariantScore[],
    rowCount: number,
  ): ContentRunAnalyticsSummary {
    const winner = scores[0];
    const totalViews = scores.reduce((sum, score) => sum + score.totalViews, 0);
    const totalEngagements = scores.reduce(
      (sum, score) => sum + score.totalEngagements,
      0,
    );
    const avgEngagementRate =
      scores.reduce((sum, score) => sum + score.avgEngagementRate, 0) /
      Math.max(scores.length, 1);

    return {
      engagementRate: avgEngagementRate,
      engagements: totalEngagements,
      impressions: totalViews,
      metadata: {
        sampleSize: rowCount,
        scoreWeights: {
          engagementRate: 0.3,
          performanceScore: 0.6,
          volume: 0.1,
        },
        variantScores: scores,
      },
      summary: winner
        ? `${winner.variantId} leads with ${winner.score.toFixed(1)} weighted score.`
        : 'No variant performance has been synced for this run.',
      topSignals: winner
        ? [
            winner.platform ? `Platform: ${winner.platform}` : undefined,
            winner.format ? `Format: ${winner.format}` : undefined,
            `Avg engagement: ${winner.avgEngagementRate.toFixed(2)}%`,
            `Performance score: ${winner.avgPerformanceScore.toFixed(1)}`,
          ].filter((signal): signal is string => Boolean(signal))
        : [],
      winningVariantId: winner?.variantId,
    };
  }

  private buildRecommendations(
    config: Record<string, unknown>,
    scores: RunVariantScore[],
  ): ContentRunRecommendation[] {
    const winner = scores[0];
    if (!winner) {
      return [
        {
          action:
            'Sync or import analytics for this run before choosing a winner.',
          confidence: 0.4,
          metadata: { reason: 'missing_performance_rows' },
          rationale:
            'Winner detection needs at least one performance record tied to this content run.',
          type: 'collect_run_analytics',
        },
      ];
    }

    const lowPerformers = scores.filter(
      (score) => score.rank > 1 && score.score < winner.score * 0.5,
    );
    const brief = this.isRecord(config.brief) ? config.brief : {};
    const hook =
      this.readString(brief.hypothesis) ??
      this.readString(brief.angle) ??
      winner.variantId;

    const recommendations: ContentRunRecommendation[] = [
      {
        action: `Extend ${winner.variantId} into the next highest-fit format.`,
        confidence: Math.min(winner.score / 100, 0.95),
        metadata: {
          format: winner.format,
          platform: winner.platform,
          score: winner.score,
          variantId: winner.variantId,
        },
        rationale:
          'The winning variant has the strongest blend of performance score, engagement rate, and audience volume.',
        type: 'extend_winner_format',
      },
      {
        action: 'Clone the winning hook into a fresh trend brief.',
        confidence: Math.min(winner.avgEngagementRate / 10, 0.9),
        metadata: {
          hook,
          sourceVariantId: winner.variantId,
        },
        rationale:
          'The hook is the highest-confidence reusable element from this run.',
        type: 'clone_hook_into_trend',
      },
    ];

    if (winner.totalEngagements > 0) {
      recommendations.push({
        action: 'Create a follow-up from comments and engagement signals.',
        confidence: Math.min(winner.totalEngagements / 1000, 0.85),
        metadata: {
          engagements: winner.totalEngagements,
          sourceVariantId: winner.variantId,
        },
        rationale:
          'The winning variant has enough engagement to justify a reply or follow-up angle.',
        type: 'create_follow_up_from_engagement',
      });
    }

    if (lowPerformers.length > 0) {
      recommendations.push({
        action: 'Retire or rewrite variants that materially trail the winner.',
        confidence: 0.7,
        metadata: {
          retiredVariantIds: lowPerformers.map((score) => score.variantId),
          winnerScore: winner.score,
        },
        rationale:
          'Low-scoring variants are below half of the winning weighted score.',
        type: 'retire_low_performing_variants',
      });
    }

    return recommendations;
  }

  async analyzeRun(
    organizationId: string,
    runId: string,
  ): Promise<RunRecommendationResult> {
    const run = (await this.prisma.contentRun.findFirst({
      where: { id: runId, isDeleted: false, organizationId },
    })) as unknown as ContentRunRow | null;

    if (!run) {
      throw new NotFoundException('ContentRun', runId);
    }

    const config = this.readConfig(run);
    const variants = this.readVariants(config);
    const rows = (await this.prisma.contentPerformance.findMany({
      where: {
        contentRunId: runId,
        isDeleted: false,
        organizationId,
      },
    })) as PerformanceRow[];
    const scores = this.aggregateRows(rows, variants);
    const analyticsSummary = this.buildAnalyticsSummary(scores, rows.length);
    const recommendations = this.buildRecommendations(config, scores);
    const nextConfig = {
      ...config,
      analyticsSummary,
      recommendations,
    };

    const updatedRun = (await this.prisma.contentRun.update({
      data: { config: this.toJsonValue(nextConfig) },
      where: { id: runId },
    })) as unknown as Record<string, unknown>;

    return {
      analyticsSummary,
      recommendations,
      scores,
      updatedRun: this.hydrateRun(updatedRun),
    };
  }
}
