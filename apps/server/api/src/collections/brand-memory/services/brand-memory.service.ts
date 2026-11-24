import type {
  BrandMemoryDocument,
  BrandMemoryInsight,
} from '@api/collections/brand-memory/schemas/brand-memory.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  type Prisma,
  type BrandMemory as PrismaBrandMemory,
  toPrismaJson,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface BrandMemoryEntryInput {
  type: string;
  content: string;
  /**
   * Replay identity: an entry with the same key in the day's row is replaced
   * instead of appended, so re-running a sync never duplicates it.
   */
  key?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Insight sources written by analytics replays. One insight per source per
 * day: a replay replaces the earlier copy instead of appending a duplicate.
 */
const REPLAY_KEYED_INSIGHT_SOURCE_PREFIXES = [
  'analytics-threshold:',
  'analytics-winner:',
] as const;

function readSource(value: unknown): unknown {
  return value && typeof value === 'object' && 'source' in value
    ? value.source
    : undefined;
}

function readKey(value: unknown): unknown {
  return value && typeof value === 'object' && 'key' in value
    ? value.key
    : undefined;
}

/**
 * The `type` of the one row per brand and day that holds the day's entries,
 * insights and metrics. `brand_memories` has no column for any of them, so
 * they ride in the row's `metadata`; typed rows (`upsertTypedEntry`) keep their
 * own `type` and never mix with it.
 */
/** One daily row per brand per day: a year of days bounds every daily read. */
const MAX_DAILY_ROWS = 366;

const DAILY_MEMORY_TYPE = 'daily';

interface DailyMemoryBody {
  entries: unknown[];
  insights: unknown[];
  metrics: Record<string, unknown>;
}

function readDailyBody(metadata: unknown): DailyMemoryBody {
  const body =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const metrics = body.metrics;
  return {
    entries: Array.isArray(body.entries) ? body.entries : [],
    insights: Array.isArray(body.insights) ? body.insights : [],
    metrics:
      metrics && typeof metrics === 'object' && !Array.isArray(metrics)
        ? (metrics as Record<string, unknown>)
        : {},
  };
}

/** A daily row as the document consumers read: entries, insights and metrics up front. */
function toDailyDocument(row: PrismaBrandMemory): BrandMemoryDocument {
  const { entries, insights, metrics } = readDailyBody(row.metadata);
  return {
    ...row,
    entries,
    insights,
    metrics,
  } as unknown as BrandMemoryDocument;
}

export interface BrandMemoryInsightInput {
  category: string;
  insight: string;
  confidence: number;
  source: string;
  createdAt?: Date;
}

export interface BrandMemoryMetricsInput {
  postsPublished?: number;
  totalEngagement?: number;
  avgEngagementRate?: number;
  topPerformingFormat?: string;
  topPerformingTime?: string;
}

/**
 * One durable row per `(organizationId, brandId, type)` — e.g. an Expert Path
 * positioning answer stored as `positioning.originStory`.
 */
export interface BrandMemoryTypedEntryInput {
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface BrandMemoryDateRange {
  from?: Date;
  to?: Date;
}

@Traced()
@Injectable()
export class BrandMemoryService extends BaseService<
  BrandMemoryDocument,
  Partial<BrandMemoryDocument>,
  Partial<BrandMemoryDocument>,
  Prisma.BrandMemoryWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'brandMemory', logger);
  }

  async logEntry(
    organizationId: string,
    brandId: string,
    entry: BrandMemoryEntryInput,
  ): Promise<BrandMemoryDocument | null> {
    const newEntry = {
      content: entry.content,
      ...(entry.key ? { key: entry.key } : {}),
      metadata: entry.metadata,
      timestamp: entry.timestamp ?? new Date(),
      type: entry.type,
    };

    return this.writeDailyBody(organizationId, brandId, (body) => ({
      ...body,
      entries: [
        ...(entry.key
          ? body.entries.filter((current) => readKey(current) !== entry.key)
          : body.entries),
        newEntry,
      ],
    }));
  }

  async addInsight(
    organizationId: string,
    brandId: string,
    insight: BrandMemoryInsightInput,
  ): Promise<BrandMemoryDocument | null> {
    const newInsight = {
      category: insight.category,
      confidence: insight.confidence,
      createdAt: insight.createdAt ?? new Date(),
      insight: insight.insight,
      source: insight.source,
    };
    const isReplayKeyed = REPLAY_KEYED_INSIGHT_SOURCE_PREFIXES.some((prefix) =>
      insight.source.startsWith(prefix),
    );

    return this.writeDailyBody(organizationId, brandId, (body) => ({
      ...body,
      insights: [
        ...(isReplayKeyed
          ? body.insights.filter(
              (current) => readSource(current) !== insight.source,
            )
          : body.insights),
        newInsight,
      ],
    }));
  }

  async updateMetrics(
    organizationId: string,
    brandId: string,
    metrics: BrandMemoryMetricsInput,
  ): Promise<BrandMemoryDocument | null> {
    const changes = Object.fromEntries(
      Object.entries(metrics).filter(([, value]) => value !== undefined),
    );

    return this.writeDailyBody(organizationId, brandId, (body) => ({
      ...body,
      metrics: { ...body.metrics, ...changes },
    }));
  }

  /**
   * Applies `change` to today's daily row, creating the row when the brand has
   * none yet. The day's entries, insights and metrics are stored in the row's
   * `metadata` because the table has no column for them.
   */
  private async writeDailyBody(
    organizationId: string,
    brandId: string,
    change: (body: DailyMemoryBody) => DailyMemoryBody,
  ): Promise<BrandMemoryDocument> {
    const now = new Date();
    const existing = await this.prisma.brandMemory.findFirst({
      orderBy: { updatedAt: 'desc' },
      where: scopedWhere(organizationId, {
        brandId,
        date: { gte: this.startOfDay(now), lt: this.endOfDay(now) },
        type: DAILY_MEMORY_TYPE,
      }),
    });
    const body = change(readDailyBody(existing?.metadata));
    const metadata = toPrismaJson(body);

    const row = existing
      ? await this.prisma.brandMemory.update({
          data: { metadata },
          where: scopedWhere(organizationId, { brandId, id: existing.id }),
        })
      : await this.prisma.brandMemory.create({
          data: {
            brandId,
            date: this.startOfDay(now),
            isDeleted: false,
            metadata,
            organizationId,
            type: DAILY_MEMORY_TYPE,
          },
        });
    return toDailyDocument(row);
  }

  /**
   * Upsert a typed memory row on the model's own `type`/`content`/`metadata`
   * columns. Re-answering overwrites the same row instead of appending.
   */
  async upsertTypedEntry(
    organizationId: string,
    brandId: string,
    entry: BrandMemoryTypedEntryInput,
  ): Promise<PrismaBrandMemory> {
    const existing = await this.prisma.brandMemory.findFirst({
      orderBy: { updatedAt: 'desc' },
      where: scopedWhere(organizationId, { brandId, type: entry.type }),
      select: { id: true },
    });

    const data = {
      content: entry.content,
      date: new Date(),
      ...(entry.metadata ? { metadata: toPrismaJson(entry.metadata) } : {}),
    };

    if (existing) {
      return this.prisma.brandMemory.update({
        data,
        where: scopedWhere(organizationId, { id: existing.id }),
      });
    }

    return this.prisma.brandMemory.create({
      data: {
        ...data,
        brandId,
        isDeleted: false,
        organizationId,
        type: entry.type,
      },
    });
  }

  /** Typed rows whose `type` starts with `typePrefix`, newest first. */
  listTypedEntries(
    organizationId: string,
    brandId: string,
    typePrefix: string,
  ): Promise<PrismaBrandMemory[]> {
    return this.prisma.brandMemory.findMany({
      orderBy: { updatedAt: 'desc' },
      where: scopedWhere(organizationId, {
        brandId,
        type: { startsWith: typePrefix },
      }),
    });
  }

  async getMemory(
    organizationId: string,
    brandId: string,
    dateRange?: BrandMemoryDateRange,
  ): Promise<BrandMemoryDocument[]> {
    const rows = await this.prisma.brandMemory.findMany({
      orderBy: { date: 'desc' },
      take: MAX_DAILY_ROWS,
      where: scopedWhere(organizationId, {
        brandId,
        type: DAILY_MEMORY_TYPE,
        ...(dateRange?.from || dateRange?.to
          ? {
              date: {
                ...(dateRange.from && { gte: dateRange.from }),
                ...(dateRange.to && { lte: dateRange.to }),
              },
            }
          : {}),
      }),
    });
    return rows.map(toDailyDocument);
  }

  async getInsights(
    organizationId: string,
    brandId: string,
    limit: number = 20,
  ): Promise<BrandMemoryInsight[]> {
    const rows = await this.prisma.brandMemory.findMany({
      orderBy: { date: 'desc' },
      take: Math.max(1, limit),
      where: scopedWhere(organizationId, { brandId, type: DAILY_MEMORY_TYPE }),
    });

    const insights = rows.flatMap(
      (row) => readDailyBody(row.metadata).insights as BrandMemoryInsight[],
    );

    return insights
      .sort((left, right) => {
        const leftTime = left.createdAt
          ? new Date(left.createdAt).getTime()
          : 0;
        const rightTime = right.createdAt
          ? new Date(right.createdAt).getTime()
          : 0;
        return rightTime - leftTime;
      })
      .slice(0, limit);
  }

  async distillLongTermMemory(
    organizationId: string,
    brandId: string,
  ): Promise<BrandMemoryInsight[]> {
    const now = new Date();
    const fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.brandMemory.findMany({
      take: MAX_DAILY_ROWS,
      where: scopedWhere(organizationId, {
        brandId,
        date: { gte: fromDate, lte: now },
        type: DAILY_MEMORY_TYPE,
      }),
    });

    const formatMap = new Map<
      string,
      { totalEngagement: number; count: number }
    >();
    for (const row of rows) {
      const { metrics } = readDailyBody(row.metadata);
      const fmt = metrics?.topPerformingFormat as string | undefined;
      const eng = (metrics?.avgEngagementRate as number) ?? 0;
      if (fmt) {
        const existing = formatMap.get(fmt) ?? { count: 0, totalEngagement: 0 };
        existing.count += 1;
        existing.totalEngagement += eng;
        formatMap.set(fmt, existing);
      }
    }

    const topFormats = Array.from(formatMap.entries())
      .map(([fmt, data]) => ({
        avgEngagementRate:
          data.count > 0 ? data.totalEngagement / data.count : 0,
        count: data.count,
        format: fmt,
      }))
      .sort(
        (a, b) =>
          b.avgEngagementRate - a.avgEngagementRate || b.count - a.count,
      )
      .slice(0, 3);

    const distilledInsights: BrandMemoryInsight[] = topFormats.map(
      (format) => ({
        category: 'format',
        confidence: Math.min(1, 0.4 + format.count / 30),
        createdAt: now,
        insight: `${format.format} drives the strongest engagement (${format.avgEngagementRate.toFixed(2)}% avg over ${format.count} days).`,
        source: 'memory_distiller_30d',
      }),
    );

    for (const insight of distilledInsights) {
      await this.addInsight(organizationId, brandId, {
        ...insight,
        createdAt:
          insight.createdAt instanceof Date
            ? insight.createdAt
            : insight.createdAt
              ? new Date(insight.createdAt)
              : undefined,
      });
    }

    return distilledInsights;
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(24, 0, 0, 0);
    return result;
  }
}
