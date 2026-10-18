import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface PerformanceThresholdAlert {
  type: 'spike' | 'drop';
  metric: 'engagementRate';
  recentAverage: number;
  baselineAverage: number;
  ratio: number;
}

type ContentPerformanceData = {
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  views?: number;
  engagementRate?: number;
  measuredAt?: string | Date;
  platform?: string;
  contentType?: string;
  hookUsed?: string;
};

type MeasuredPerformanceRow = {
  comments: number | null;
  contentType: string | null;
  data: unknown;
  engagementRate: number | null;
  likes: number | null;
  postId: string | null;
  saves: number | null;
  shares: number | null;
  views: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS_PER_WINDOW = 200;
/** A post wins when its engagement rate is at least this multiple of baseline. */
const WINNER_RATIO = 2;
/** Baseline posts required before a winner claim is made. */
const MIN_WINNER_BASELINE_POSTS = 3;
const WINNER_BASELINE_DAYS = 10;
const MAX_HOOK_LENGTH = 140;

@Injectable()
export class BrandMemorySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandMemoryService: BrandMemoryService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Records the post's latest measurement in brand memory. Replays of the same
   * post replace the day's entry, the day's metrics are recomputed from the
   * latest measurement of every post measured that day, and a post that clearly
   * outperforms the brand baseline becomes a deduplicated insight — the layer
   * generation reads.
   */
  async syncPostPerformance(
    organizationId: string,
    brandId: string,
    postId: string,
  ): Promise<void> {
    const performance = await this.prisma.contentPerformance.findFirst({
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      where: scopedWhere(organizationId, { brandId, postId }),
    });

    if (!performance) {
      this.logger.warn('BrandMemorySyncService.syncPostPerformance no data', {
        brandId,
        organizationId,
        postId,
      });
      return;
    }

    const data = this.readData(performance.data);
    const totalEngagement = this.totalEngagement(performance);
    const measuredAt = performance.measuredAt ?? performance.createdAt;
    const engagementRate = this.observedEngagementRate(performance);
    const platform = performance.platform ?? data.platform;
    const contentType = performance.contentType ?? data.contentType;
    const platformLabel = platform ? ` on ${platform}` : '';
    const rateLabel =
      engagementRate === undefined
        ? 'no reported views'
        : `${engagementRate.toFixed(2)}% engagement rate`;

    await this.brandMemoryService.logEntry(organizationId, brandId, {
      content: `Post ${postId}${platformLabel} reached ${totalEngagement} engagements with ${rateLabel}.`,
      key: `post_performance:${postId}`,
      metadata: {
        contentType,
        engagementRate,
        measuredAt,
        platform,
        postId,
      },
      timestamp: measuredAt,
      type: 'post_performance',
    });

    await this.syncDailyMetrics(organizationId, brandId, measuredAt);

    if (engagementRate !== undefined) {
      await this.emitWinnerInsight(organizationId, brandId, postId, {
        engagementRate,
        hookUsed: data.hookUsed,
        measuredAt,
        platform,
      });
    }
  }

  async detectThresholdAlerts(
    organizationId: string,
    brandId: string,
  ): Promise<PerformanceThresholdAlert[]> {
    const now = new Date();
    const recentStart = new Date(now.getTime() - 3 * DAY_MS);
    const baselineStart = new Date(now.getTime() - 10 * DAY_MS);
    const baselineEnd = recentStart;

    const [recent, baseline] = await Promise.all([
      this.findLatestMeasuredPerPost(organizationId, brandId, {
        gte: recentStart,
        lte: now,
      }),
      this.findLatestMeasuredPerPost(organizationId, brandId, {
        gte: baselineStart,
        lt: baselineEnd,
      }),
    ]);

    const recentAverage = this.averageRate(recent);
    const baselineAverage = this.averageRate(baseline);

    if (
      recentAverage === undefined ||
      baselineAverage === undefined ||
      baselineAverage <= 0
    ) {
      return [];
    }

    const ratio = recentAverage / baselineAverage;

    const type = ratio > 2 ? 'spike' : ratio < 0.5 ? 'drop' : undefined;
    if (!type) {
      return [];
    }

    await this.brandMemoryService.addInsight(organizationId, brandId, {
      category: 'performance',
      confidence: Math.min(1, recent.length / 10),
      createdAt: now,
      insight: `Engagement ${type}: recent posts averaged ${recentAverage.toFixed(2)}% engagement versus ${baselineAverage.toFixed(2)}% in the preceding baseline (${ratio.toFixed(2)}x).`,
      source: `analytics-threshold:engagementRate:${now.toISOString().slice(0, 10)}`,
    });

    return [
      { baselineAverage, metric: 'engagementRate', ratio, recentAverage, type },
    ];
  }

  /**
   * Day metrics come from every post measured that day (latest row per post),
   * so a replay or a second post never overwrites them with one post's numbers.
   */
  private async syncDailyMetrics(
    organizationId: string,
    brandId: string,
    measuredAt: Date,
  ): Promise<void> {
    const dayStart = new Date(measuredAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(24, 0, 0, 0);
    const rows = await this.prisma.contentPerformance.findMany({
      distinct: ['postId'],
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS_PER_WINDOW,
      where: scopedWhere(organizationId, {
        brandId,
        measuredAt: { gte: dayStart, lt: dayEnd },
      }),
    });
    const rates = rows.flatMap((row) => {
      const rate = this.observedEngagementRate(row);
      return rate === undefined ? [] : [{ rate, row }];
    });
    const formatRates = new Map<string, number[]>();
    for (const { rate, row } of rates) {
      const format = row.contentType ?? this.readData(row.data).contentType;
      if (!format) continue;
      formatRates.set(format, [...(formatRates.get(format) ?? []), rate]);
    }
    const topFormat = [...formatRates.entries()]
      .map(([format, values]) => ({ format, rate: this.mean(values) }))
      .sort((left, right) => right.rate - left.rate)[0]?.format;

    await this.brandMemoryService.updateMetrics(organizationId, brandId, {
      ...(rates.length
        ? { avgEngagementRate: this.mean(rates.map(({ rate }) => rate)) }
        : {}),
      postsPublished: rows.length,
      ...(topFormat ? { topPerformingFormat: topFormat } : {}),
      totalEngagement: rows.reduce(
        (sum, row) => sum + this.totalEngagement(row),
        0,
      ),
    });
  }

  private async emitWinnerInsight(
    organizationId: string,
    brandId: string,
    postId: string,
    measurement: {
      engagementRate: number;
      hookUsed?: string;
      measuredAt: Date;
      platform?: string | null;
    },
  ): Promise<void> {
    const baseline = (
      await this.findLatestMeasuredPerPost(organizationId, brandId, {
        gte: new Date(
          measurement.measuredAt.getTime() - WINNER_BASELINE_DAYS * DAY_MS,
        ),
        lte: measurement.measuredAt,
      })
    ).filter((row) => row.postId !== postId);
    if (baseline.length < MIN_WINNER_BASELINE_POSTS) return;
    const baselineAverage = this.averageRate(baseline);
    if (baselineAverage === undefined || baselineAverage <= 0) return;
    const ratio = measurement.engagementRate / baselineAverage;
    if (ratio < WINNER_RATIO) return;

    const platformLabel = measurement.platform
      ? ` on ${measurement.platform}`
      : '';
    const hook = measurement.hookUsed?.trim().slice(0, MAX_HOOK_LENGTH);
    await this.brandMemoryService.addInsight(organizationId, brandId, {
      category: 'performance',
      confidence: Math.min(1, baseline.length / 10),
      createdAt: new Date(),
      insight: `Winning post${platformLabel}: ${measurement.engagementRate.toFixed(2)}% engagement versus a ${baselineAverage.toFixed(2)}% baseline across ${baseline.length} recent posts (${ratio.toFixed(2)}x).${hook ? ` Hook: "${hook}"` : ''}`,
      source: `analytics-winner:${postId}`,
    });
  }

  /** Latest measured row per post with reported views inside the window. */
  private findLatestMeasuredPerPost(
    organizationId: string,
    brandId: string,
    measuredAt: { gte: Date; lt?: Date; lte?: Date },
  ): Promise<MeasuredPerformanceRow[]> {
    return this.prisma.contentPerformance.findMany({
      distinct: ['postId'],
      orderBy: [{ measuredAt: 'desc' }, { id: 'desc' }],
      take: MAX_ROWS_PER_WINDOW,
      where: scopedWhere(organizationId, {
        brandId,
        measuredAt,
        views: { gt: 0 },
      }),
    });
  }

  /** Engagement rate only when views were reported; never a fabricated 0. */
  private observedEngagementRate(
    row: Pick<MeasuredPerformanceRow, 'data' | 'engagementRate' | 'views'>,
  ): number | undefined {
    const data = this.readData(row.data);
    const views = row.views ?? data.views;
    if (typeof views !== 'number' || views <= 0) return undefined;
    const rate = row.engagementRate ?? data.engagementRate;
    return typeof rate === 'number' && Number.isFinite(rate) ? rate : undefined;
  }

  private totalEngagement(row: MeasuredPerformanceRow): number {
    const data = this.readData(row.data);
    return (
      (row.likes ?? data.likes ?? 0) +
      (row.comments ?? data.comments ?? 0) +
      (row.shares ?? data.shares ?? 0) +
      (row.saves ?? data.saves ?? 0) +
      (data.clicks ?? 0)
    );
  }

  private averageRate(rows: MeasuredPerformanceRow[]): number | undefined {
    const rates = rows.flatMap((row) => {
      const rate = this.observedEngagementRate(row);
      return rate === undefined ? [] : [rate];
    });
    return rates.length ? this.mean(rates) : undefined;
  }

  private mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private readData(value: unknown): ContentPerformanceData {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as ContentPerformanceData)
      : {};
  }
}
