import type {
  TrendCorpusFreshnessResult,
  TrendCorpusFreshnessSegment,
  TrendCorpusFreshnessStatus,
  TrendProviderFailureSummary,
  TrendSourceClassification,
  TrendSourceIntendedUse,
  TrendSourceKind,
} from '@api/collections/trends/interfaces/trend.interfaces';
import {
  DEFAULT_SOURCE_FRESHNESS_WINDOW_DAYS_BY_KIND as DEFAULT_FRESHNESS_WINDOW_DAYS_BY_SOURCE_KIND,
  normalizeTrendSourceClassification,
} from '@api/collections/trends/utils/trend-source-classification.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export interface TrendCorpusFreshnessHealthOptions {
  isPlatformAdmin?: boolean;
  now?: Date;
  organizationId?: string;
  platform?: string;
  sourcePreviewStaleAfterDays?: number;
}

interface ReferenceHealthData {
  authorHandle?: string;
  firstSeenAt?: string;
  lastSeenAt?: string;
  matchedTrendTopics?: string[];
  platform?: string;
  publishedAt?: string;
  sourceClassification?: TrendSourceClassification;
}

interface ReferenceHealthDoc {
  createdAt: Date;
  data: unknown;
  id: string;
  lastSeenAt?: Date | null;
  platform?: string | null;
}

interface TrendHealthDoc {
  createdAt?: Date;
  data: unknown;
  id: string;
  lastSeenAt?: Date | null;
  platform?: string | null;
  updatedAt?: Date;
}

interface FreshnessSegmentAccumulator {
  freshnessWindowDays: number;
  intendedUse: TrendSourceIntendedUse;
  latestSeenAt?: Date;
  oldestSeenAt?: Date;
  platform: string;
  provider: string;
  referenceCount: number;
  sourceKind: TrendSourceKind;
  staleReferenceCount: number;
}

interface ProviderFailureAccumulator {
  affectedTrendCount: number;
  latestObservedAt?: Date;
  message: string;
  platform: string;
  provider: string;
  reason: TrendProviderFailureSummary['reason'];
  retryAction: string;
  severity: TrendProviderFailureSummary['severity'];
}

const DEFAULT_SOURCE_PREVIEW_STALE_AFTER_DAYS = 3;
const MAX_CORPUS_FRESHNESS_REFERENCE_RECORDS = 5000;
const MAX_CORPUS_FRESHNESS_TREND_RECORDS = 2000;

/**
 * Owns corpus-health queries, tenant scoping, freshness aggregation, and
 * provider-failure projection.
 */
@Injectable()
export class TrendCorpusFreshnessService {
  constructor(private readonly prisma: PrismaService) {}

  async getCorpusFreshnessHealth(
    options: TrendCorpusFreshnessHealthOptions = {},
  ): Promise<TrendCorpusFreshnessResult> {
    const now = options.now ?? new Date();
    const sourcePreviewStaleAfterDays =
      options.sourcePreviewStaleAfterDays ??
      DEFAULT_SOURCE_PREVIEW_STALE_AFTER_DAYS;

    const [referenceDocs, trendDocs] = await Promise.all([
      this.prisma.trendSourceReference.findMany({
        orderBy: [{ platform: 'asc' }, { lastSeenAt: 'asc' }],
        select: {
          createdAt: true,
          data: true,
          id: true,
          lastSeenAt: true,
          platform: true,
        },
        take: MAX_CORPUS_FRESHNESS_REFERENCE_RECORDS,
        where: {
          ...(options.platform ? { platform: options.platform } : {}),
          isDeleted: false,
        },
      }) as Promise<ReferenceHealthDoc[]>,
      this.prisma.trend.findMany({
        orderBy: [{ platform: 'asc' }, { updatedAt: 'asc' }],
        select: {
          createdAt: true,
          data: true,
          id: true,
          lastSeenAt: true,
          platform: true,
          updatedAt: true,
        },
        take: MAX_CORPUS_FRESHNESS_TREND_RECORDS,
        where: this.buildFreshnessTrendWhere(options),
      }) as Promise<TrendHealthDoc[]>,
    ]);

    const segments = this.buildFreshnessSegments(referenceDocs, now);
    const providerFailures = this.buildProviderFailures(
      trendDocs,
      now,
      sourcePreviewStaleAfterDays,
    );
    const activeTrends = trendDocs.filter((doc) =>
      this.isCurrentTrend(doc, now),
    ).length;
    const status = this.resolveCorpusFreshnessStatus(
      referenceDocs.length,
      segments,
      providerFailures,
    );
    const platforms = Array.from(
      new Set(
        [
          ...segments.map((segment) => segment.platform),
          ...providerFailures.map((failure) => failure.platform),
        ].filter(Boolean),
      ),
    ).sort();

    return {
      generatedAt: now.toISOString(),
      providerFailures,
      segments,
      status,
      summary: {
        activeTrends,
        failingProviders: providerFailures.length,
        freshSegments: segments.filter(
          (segment) => segment.status === 'healthy',
        ).length,
        platforms,
        referenceRecords: referenceDocs.length,
        staleSegments: segments.filter(
          (segment) =>
            segment.status === 'stale' || segment.status === 'degraded',
        ).length,
        totalSegments: segments.length,
      },
      thresholds: {
        defaultFreshnessWindowDaysBySourceKind:
          DEFAULT_FRESHNESS_WINDOW_DAYS_BY_SOURCE_KIND,
        recordLimits: {
          referenceRecords: MAX_CORPUS_FRESHNESS_REFERENCE_RECORDS,
          trends: MAX_CORPUS_FRESHNESS_TREND_RECORDS,
        },
        sourcePreviewStaleAfterDays,
      },
    };
  }

  /**
   * Trend rows are organization-scoped or global. Platform admins receive the
   * cross-organization pipeline view; other callers receive their organization
   * plus the global baseline.
   */
  private buildFreshnessTrendWhere(
    options: TrendCorpusFreshnessHealthOptions,
  ): Prisma.TrendWhereInput {
    const where: Prisma.TrendWhereInput = {
      ...(options.platform ? { platform: options.platform } : {}),
      isDeleted: false,
    };

    if (options.isPlatformAdmin) {
      return where;
    }

    where.OR = options.organizationId
      ? [{ organizationId: options.organizationId }, { organizationId: null }]
      : [{ organizationId: null }];

    return where;
  }

  private buildFreshnessSegments(
    referenceDocs: ReferenceHealthDoc[],
    now: Date,
  ): TrendCorpusFreshnessSegment[] {
    const bySegment = new Map<string, FreshnessSegmentAccumulator>();

    for (const doc of referenceDocs) {
      const data = this.asRecord(doc.data) as ReferenceHealthData;
      const classification = this.resolveSourceClassification(
        data.sourceClassification,
        {
          capturedAt: data.firstSeenAt,
          platform:
            this.readString(doc.platform) ?? this.readString(data.platform),
          sourceAuthor: data.authorHandle,
          sourceTimestamp: data.publishedAt ?? data.lastSeenAt,
          sourceTopic: data.matchedTrendTopics?.[0],
        },
      );
      const platform =
        this.readString(doc.platform) ??
        this.readString(data.platform) ??
        'unknown';
      const sourceKind =
        classification?.sourceKind ?? 'public_platform_reference';
      const intendedUse =
        classification?.intendedUse ?? 'organic_trend_discovery';
      const provider = classification?.sourceLabel ?? platform;
      const freshnessWindowDays =
        classification?.freshnessWindowDays ??
        DEFAULT_FRESHNESS_WINDOW_DAYS_BY_SOURCE_KIND[sourceKind];
      const segmentId = [
        'reference-corpus',
        sourceKind,
        intendedUse,
        platform,
        provider,
      ].join(':');
      const seenAt =
        this.readDate(doc.lastSeenAt) ??
        this.readDate(data.lastSeenAt) ??
        this.readDate(doc.createdAt) ??
        now;
      const stale = this.calculateAgeDays(now, seenAt) > freshnessWindowDays;
      const accumulator = bySegment.get(segmentId) ?? {
        freshnessWindowDays,
        intendedUse,
        platform,
        provider,
        referenceCount: 0,
        sourceKind,
        staleReferenceCount: 0,
      };

      accumulator.referenceCount += 1;
      accumulator.staleReferenceCount += stale ? 1 : 0;
      accumulator.latestSeenAt =
        accumulator.latestSeenAt == null || seenAt > accumulator.latestSeenAt
          ? seenAt
          : accumulator.latestSeenAt;
      accumulator.oldestSeenAt =
        accumulator.oldestSeenAt == null || seenAt < accumulator.oldestSeenAt
          ? seenAt
          : accumulator.oldestSeenAt;
      bySegment.set(segmentId, accumulator);
    }

    return Array.from(bySegment.entries())
      .map(([id, segment]) => ({
        freshnessWindowDays: segment.freshnessWindowDays,
        id,
        intendedUse: segment.intendedUse,
        latestSeenAt: segment.latestSeenAt?.toISOString(),
        oldestSeenAt: segment.oldestSeenAt?.toISOString(),
        platform: segment.platform,
        provider: segment.provider,
        referenceCount: segment.referenceCount,
        sourceKind: segment.sourceKind,
        staleReferenceCount: segment.staleReferenceCount,
        status: this.resolveSegmentStatus(
          segment.referenceCount,
          segment.staleReferenceCount,
        ),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  private buildProviderFailures(
    trendDocs: TrendHealthDoc[],
    now: Date,
    sourcePreviewStaleAfterDays: number,
  ): TrendProviderFailureSummary[] {
    const failures = new Map<string, ProviderFailureAccumulator>();

    for (const doc of trendDocs) {
      if (!this.isCurrentTrend(doc, now)) {
        continue;
      }

      const data = this.asRecord(doc.data);
      const metadata = this.asRecord(data.metadata);
      if (metadata.prelaunchCorpus === true) {
        continue;
      }

      const sourcePreviewState = this.readString(metadata.sourcePreviewState);
      const cachedAt = this.readDate(metadata.sourcePreviewCachedAt);
      const observedAt =
        cachedAt ??
        this.readDate(doc.updatedAt) ??
        this.readDate(doc.lastSeenAt) ??
        this.readDate(doc.createdAt);
      const platform =
        this.readString(doc.platform) ??
        this.readString(data.platform) ??
        'unknown';
      const provider =
        this.readString(metadata.source) ??
        this.readString(metadata.sourceProvider) ??
        platform;

      if (sourcePreviewState === 'empty') {
        this.recordProviderFailure(failures, {
          message:
            'The trend source preview produced no usable source references.',
          observedAt,
          platform,
          provider,
          reason: 'empty_source_preview',
          retryAction: `Refresh ${platform} trends and inspect provider fetch logs.`,
          severity: 'error',
        });
        continue;
      }

      if (sourcePreviewState === 'fallback') {
        this.recordProviderFailure(failures, {
          message:
            'The trend source preview is using fallback references instead of live provider data.',
          observedAt,
          platform,
          provider,
          reason: 'fallback_source_preview',
          retryAction: `Refresh ${platform} trends and verify provider credentials or rate limits.`,
          severity: 'warning',
        });
      }

      if (
        cachedAt &&
        this.calculateAgeDays(now, cachedAt) > sourcePreviewStaleAfterDays
      ) {
        this.recordProviderFailure(failures, {
          message:
            'The cached trend source preview is older than the freshness threshold.',
          observedAt: cachedAt,
          platform,
          provider,
          reason: 'stale_source_preview',
          retryAction: `Run source-preview precompute or refresh ${platform} trends.`,
          severity: 'warning',
        });
      }
    }

    return Array.from(failures.values())
      .map((failure) => ({
        affectedTrendCount: failure.affectedTrendCount,
        latestObservedAt: failure.latestObservedAt?.toISOString(),
        message: failure.message,
        platform: failure.platform,
        provider: failure.provider,
        reason: failure.reason,
        retryAction: failure.retryAction,
        severity: failure.severity,
      }))
      .sort((left, right) =>
        `${left.platform}:${left.provider}:${left.reason}`.localeCompare(
          `${right.platform}:${right.provider}:${right.reason}`,
        ),
      );
  }

  private recordProviderFailure(
    failures: Map<string, ProviderFailureAccumulator>,
    input: {
      message: string;
      observedAt?: Date;
      platform: string;
      provider: string;
      reason: TrendProviderFailureSummary['reason'];
      retryAction: string;
      severity: TrendProviderFailureSummary['severity'];
    },
  ): void {
    const key = [input.platform, input.provider, input.reason].join(':');
    const existing = failures.get(key) ?? {
      affectedTrendCount: 0,
      message: input.message,
      platform: input.platform,
      provider: input.provider,
      reason: input.reason,
      retryAction: input.retryAction,
      severity: input.severity,
    };

    existing.affectedTrendCount += 1;
    existing.latestObservedAt =
      input.observedAt != null &&
      (existing.latestObservedAt == null ||
        input.observedAt > existing.latestObservedAt)
        ? input.observedAt
        : existing.latestObservedAt;
    failures.set(key, existing);
  }

  private resolveSegmentStatus(
    referenceCount: number,
    staleReferenceCount: number,
  ): TrendCorpusFreshnessStatus {
    if (referenceCount === 0) {
      return 'empty';
    }

    if (staleReferenceCount === 0) {
      return 'healthy';
    }

    return staleReferenceCount === referenceCount ? 'stale' : 'degraded';
  }

  private resolveCorpusFreshnessStatus(
    referenceCount: number,
    segments: TrendCorpusFreshnessSegment[],
    providerFailures: TrendProviderFailureSummary[],
  ): TrendCorpusFreshnessStatus {
    if (referenceCount === 0) {
      return 'empty';
    }

    if (
      providerFailures.some((failure) => failure.severity === 'error') ||
      segments.some((segment) => segment.status === 'stale')
    ) {
      return 'stale';
    }

    if (
      providerFailures.length > 0 ||
      segments.some((segment) => segment.status === 'degraded')
    ) {
      return 'degraded';
    }

    return 'healthy';
  }

  private resolveSourceClassification(
    value: unknown,
    defaults: {
      capturedAt?: Date | string;
      platform?: string;
      sourceAuthor?: string;
      sourceTimestamp?: Date | string;
      sourceTopic?: string;
    } = {},
  ): TrendSourceClassification | undefined {
    return normalizeTrendSourceClassification({
      ...defaults,
      value,
    });
  }

  private isCurrentTrend(doc: TrendHealthDoc, now: Date): boolean {
    const data = this.asRecord(doc.data);
    const expiresAt = this.readDate(data.expiresAt);
    return data.isCurrent === true && (!expiresAt || expiresAt > now);
  }

  private calculateAgeDays(now: Date, date: Date): number {
    return (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readDate(value: unknown): Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value !== 'string' || value.length === 0) {
      return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }
}
