import type {
  TrendCorpusFreshnessResult,
  TrendCorpusFreshnessSegment,
  TrendCorpusFreshnessStatus,
  TrendProviderFailureSummary,
  TrendSourceAccountResult,
  TrendSourceAccountSummary,
  TrendSourceClassification,
  TrendSourceIntendedUse,
  TrendSourceItem,
  TrendSourceKind,
  TrendSourceReferenceRecord,
  TrendSourceReferenceResult,
} from '@api/collections/trends/interfaces/trend.interfaces';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

interface SyncTrendInput {
  id: string;
  topic: string;
  platform: string;
  mentions: number;
  viralityScore: number;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  sourcePreview: TrendSourceItem[];
}

interface RemixLineagePayload {
  organizationId: string;
  brandId: string;
  contentDraftId?: string;
  postId?: string;
  generatedBy: string;
  platforms: string[];
  draftType?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

interface ReferenceQueryOptions {
  authorHandle?: string;
  limit?: number;
  platform?: string;
  trendId?: string;
}

interface CorpusFreshnessHealthOptions {
  now?: Date;
  platform?: string;
  sourcePreviewStaleAfterDays?: number;
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

interface ReferenceRecordData {
  authorHandle?: string;
  canonicalUrl: string;
  contentType: TrendSourceItem['contentType'];
  currentEngagementTotal: number;
  currentMetrics?: TrendSourceItem['metrics'];
  firstSeenAt: string;
  lastSeenAt: string;
  latestTrendMentions: number;
  latestTrendViralityScore: number;
  matchedTrendTopics: string[];
  mediaUrl?: string;
  platform: string;
  publishedAt?: string;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  sourceClassification?: TrendSourceClassification;
  text?: string;
  thumbnailUrl?: string;
  title?: string;
}

const DEFAULT_REFERENCE_CORPUS_LIMIT = 30;
const DEFAULT_REFERENCE_ACCOUNT_LIMIT = 20;
const MAX_REFERENCE_QUERY_LIMIT = 100;
const DEFAULT_SOURCE_PREVIEW_STALE_AFTER_DAYS = 3;
const MAX_CORPUS_FRESHNESS_REFERENCE_RECORDS = 5000;
const MAX_CORPUS_FRESHNESS_TREND_RECORDS = 2000;
const DEFAULT_FRESHNESS_WINDOW_DAYS_BY_SOURCE_KIND: Record<
  TrendSourceKind,
  number
> = {
  manual_curated_reference: 30,
  owned_brand_reference: 30,
  paid_creative_reference: 14,
  public_platform_reference: 7,
};
const TREND_SOURCE_INTENDED_USES = new Set<TrendSourceIntendedUse>([
  'evergreen_prompt_context',
  'organic_trend_discovery',
  'paid_creative_analysis',
]);

@Injectable()
export class TrendReferenceCorpusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async syncTrendReferences(
    trends: SyncTrendInput[],
  ): Promise<{ links: number; references: number; snapshots: number }> {
    let references = 0;
    let snapshots = 0;
    let links = 0;

    for (const trend of trends) {
      for (const sourceItem of trend.sourcePreview) {
        if (!sourceItem.sourceUrl) {
          continue;
        }

        const canonicalUrl = this.normalizeSourceUrl(sourceItem.sourceUrl);

        const matchedRef = await this.prisma.trendSourceReference.findFirst({
          where: {
            canonicalUrl,
            isDeleted: false,
            platform: sourceItem.platform,
          },
        });

        const engagementTotal = this.getEngagementTotal(sourceItem.metrics);
        const now = new Date();

        let referenceId: string;

        if (matchedRef) {
          const existingData =
            matchedRef.data as unknown as ReferenceRecordData;
          const matchedTopics = Array.isArray(existingData.matchedTrendTopics)
            ? existingData.matchedTrendTopics
            : [];
          const updatedTopics = matchedTopics.includes(trend.topic)
            ? matchedTopics
            : [...matchedTopics, trend.topic];

          await this.prisma.trendSourceReference.update({
            data: {
              authorHandle: sourceItem.authorHandle,
              canonicalUrl,
              currentEngagementTotal: engagementTotal,
              data: {
                ...existingData,
                authorHandle: sourceItem.authorHandle,
                canonicalUrl,
                contentType: sourceItem.contentType,
                currentEngagementTotal: engagementTotal,
                currentMetrics: sourceItem.metrics || {},
                externalId: sourceItem.id,
                lastSeenAt: now.toISOString(),
                latestTrendMentions: trend.mentions,
                latestTrendViralityScore: trend.viralityScore,
                matchedTrendTopics: updatedTopics,
                mediaUrl: sourceItem.mediaUrl,
                publishedAt: sourceItem.publishedAt
                  ? new Date(sourceItem.publishedAt).toISOString()
                  : undefined,
                sourceClassification:
                  sourceItem.sourceClassification ??
                  existingData.sourceClassification,
                sourcePreviewState: trend.sourcePreviewState,
                text: sourceItem.text,
                thumbnailUrl: sourceItem.thumbnailUrl,
                title: sourceItem.title,
              } as never,
              lastSeenAt: now,
              latestTrendViralityScore: trend.viralityScore,
              platform: sourceItem.platform,
            },
            where: { id: matchedRef.id },
          });
          referenceId = matchedRef.id;
        } else {
          const created = await this.prisma.trendSourceReference.create({
            data: {
              authorHandle: sourceItem.authorHandle,
              canonicalUrl,
              currentEngagementTotal: engagementTotal,
              data: {
                authorHandle: sourceItem.authorHandle,
                canonicalUrl,
                contentType: sourceItem.contentType,
                currentEngagementTotal: engagementTotal,
                currentMetrics: sourceItem.metrics || {},
                externalId: sourceItem.id,
                firstSeenAt: now.toISOString(),
                lastSeenAt: now.toISOString(),
                latestTrendMentions: trend.mentions,
                latestTrendViralityScore: trend.viralityScore,
                matchedTrendTopics: [trend.topic],
                mediaUrl: sourceItem.mediaUrl,
                platform: sourceItem.platform,
                publishedAt: sourceItem.publishedAt
                  ? new Date(sourceItem.publishedAt).toISOString()
                  : undefined,
                sourceClassification: sourceItem.sourceClassification,
                sourcePreviewState: trend.sourcePreviewState,
                text: sourceItem.text,
                thumbnailUrl: sourceItem.thumbnailUrl,
                title: sourceItem.title,
              } as never,
              isDeleted: false,
              lastSeenAt: now,
              latestTrendViralityScore: trend.viralityScore,
              platform: sourceItem.platform,
            },
          });
          referenceId = created.id;
        }
        references += 1;

        // Upsert snapshot for today
        const snapshotDate = this.toSnapshotDate();
        const matchedSnapshot =
          await this.prisma.trendSourceReferenceSnapshot.findFirst({
            where: {
              isDeleted: false,
              snapshotDate,
              sourceReferenceId: referenceId,
            },
          });

        if (!matchedSnapshot) {
          await this.prisma.trendSourceReferenceSnapshot.create({
            data: {
              data: {
                engagementTotal,
                metrics: sourceItem.metrics || {},
                snapshotDate: snapshotDate.toISOString(),
                trendMentions: trend.mentions,
                trendViralityScore: trend.viralityScore,
              } as never,
              isDeleted: false,
              snapshotDate,
              sourceReferenceId: referenceId,
            },
          });
          snapshots += 1;
        } else {
          await this.prisma.trendSourceReferenceSnapshot.update({
            data: {
              data: {
                engagementTotal,
                metrics: sourceItem.metrics || {},
                snapshotDate: snapshotDate.toISOString(),
                trendMentions: trend.mentions,
                trendViralityScore: trend.viralityScore,
              } as never,
              snapshotDate,
            },
            where: { id: matchedSnapshot.id },
          });
        }

        // Upsert link between trend and source reference
        const existingLink =
          await this.prisma.trendSourceReferenceLink.findFirst({
            where: {
              isDeleted: false,
              sourceReferenceId: referenceId,
              trendId: trend.id,
            },
          });

        if (!existingLink) {
          await this.prisma.trendSourceReferenceLink.create({
            data: {
              isDeleted: false,
              sourceReferenceId: referenceId,
              trendId: trend.id,
            },
          });
          links += 1;
        } else {
          // Update matchReason/rankAtCapture in a data-like field if needed
          // TrendSourceReferenceLink has no data blob — nothing to update
        }
      }
    }

    return { links, references, snapshots };
  }

  async countGlobalReferences(): Promise<number> {
    return this.prisma.trendSourceReference.count({
      where: { isDeleted: false },
    });
  }

  async recordDraftRemixLineage(payload: RemixLineagePayload): Promise<void> {
    const hasContentDraftId =
      typeof payload.contentDraftId === 'string' &&
      payload.contentDraftId.length > 0;
    const hasPostId =
      typeof payload.postId === 'string' && payload.postId.length > 0;

    if (!hasContentDraftId && !hasPostId) {
      return;
    }

    const sourceReferenceIds = await this.resolveSourceReferenceIds(
      payload.metadata,
    );
    const trendIds = [
      ...this.parseStringArray(payload.metadata?.trendIds),
      ...this.parseOptionalString(payload.metadata?.trendId),
    ];
    const sourceUrls = [
      ...this.parseStringArray(payload.metadata?.sourceUrls),
      ...this.parseOptionalString(payload.metadata?.sourceUrl),
    ];

    if (sourceReferenceIds.length === 0 && trendIds.length === 0) {
      return;
    }

    // Validate that all trendIds belong to the caller's organization before
    // connecting them to remix lineage records.
    if (trendIds.length > 0) {
      const ownedTrends = await this.prisma.trend.findMany({
        select: { id: true },
        where: {
          id: { in: trendIds },
          isDeleted: false,
          organizationId: payload.organizationId,
        },
      });

      if (ownedTrends.length !== trendIds.length) {
        throw new BadRequestException(
          'One or more trend IDs do not belong to this organization',
        );
      }
    }

    // Find existing lineage record
    const where = hasContentDraftId
      ? { contentDraftId: payload.contentDraftId }
      : { postId: payload.postId };

    const existing = await this.prisma.trendRemixLineage.findFirst({
      where: { ...where, isDeleted: false } as never,
    });

    const dataPayload = {
      draftType: payload.draftType,
      generatedBy: payload.generatedBy,
      platforms: payload.platforms,
      prompt: payload.prompt,
      sourceUrls,
    };

    if (existing) {
      await this.prisma.trendRemixLineage.update({
        data: {
          data: dataPayload as never,
          // Update relations via Prisma connect
          sourceReferences: {
            set: sourceReferenceIds.map((id) => ({ id })),
          },
          trends: {
            set: trendIds.map((id) => ({ id })),
          },
        } as never,
        where: { id: existing.id },
      });
    } else {
      await this.prisma.trendRemixLineage.create({
        data: {
          brandId: payload.brandId,
          contentDraftId: hasContentDraftId
            ? payload.contentDraftId
            : undefined,
          data: dataPayload as never,
          isDeleted: false,
          organizationId: payload.organizationId,
          postId: hasPostId ? payload.postId : undefined,
          sourceReferences: {
            connect: sourceReferenceIds.map((id) => ({ id })),
          },
          trends: {
            connect: trendIds.map((id) => ({ id })),
          },
        } as never,
      });
    }
  }

  async annotateSourceItemsWithReferenceIds<T extends TrendSourceItem>(
    items: T[],
  ): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }

    const sourceUrls = items
      .map((item) => item.sourceUrl)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

    if (sourceUrls.length === 0) {
      return items;
    }

    const canonicalUrls = Array.from(
      new Set(
        sourceUrls.map((sourceUrl) => this.normalizeSourceUrl(sourceUrl)),
      ),
    );

    const matchedRefs = await this.prisma.trendSourceReference.findMany({
      orderBy: { createdAt: 'desc' },
      take: canonicalUrls.length,
      where: {
        canonicalUrl: { in: canonicalUrls },
        isDeleted: false,
      },
    });

    if (matchedRefs.length === 0) {
      return items;
    }

    const referenceMap = new Map(
      matchedRefs.map((doc) => {
        const d = doc.data as unknown as ReferenceRecordData;
        return [doc.canonicalUrl ?? d.canonicalUrl, doc.id];
      }),
    );

    return items.map((item) => ({
      ...item,
      sourceReferenceId:
        referenceMap.get(this.normalizeSourceUrl(item.sourceUrl)) ??
        item.sourceReferenceId,
    }));
  }

  async getReferenceCorpus(
    organizationId: string | undefined,
    brandId: string | undefined,
    options: ReferenceQueryOptions = {},
  ): Promise<TrendSourceReferenceResult> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_REFERENCE_CORPUS_LIMIT,
    );

    let sourceReferenceIds: string[] | undefined;
    if (options.trendId) {
      // Verify the trend is visible to the caller before fetching its references.
      // Trends with a matching organizationId are org-owned; if organizationId is
      // undefined the caller is in an unauthenticated/internal path (allow all).
      if (organizationId) {
        const trend = await this.prisma.trend.findFirst({
          select: { id: true },
          where: {
            id: options.trendId,
            isDeleted: false,
            organizationId,
          },
        });

        if (!trend) {
          // Return empty corpus rather than leaking references linked to another
          // org's trend.
          return { items: [], totalReferences: 0 };
        }
      }

      const links = await this.prisma.trendSourceReferenceLink.findMany({
        select: { sourceReferenceId: true },
        take: Math.max(limit * 10, 100),
        where: {
          isDeleted: false,
          trendId: options.trendId,
        },
      });
      sourceReferenceIds = links
        .map((l) => l.sourceReferenceId)
        .filter((id): id is string => id != null);
    }

    const docs = await this.prisma.trendSourceReference.findMany({
      orderBy: [
        { currentEngagementTotal: 'desc' },
        { latestTrendViralityScore: 'desc' },
        { lastSeenAt: 'desc' },
      ],
      take: limit,
      where: {
        ...(options.authorHandle ? { authorHandle: options.authorHandle } : {}),
        ...(options.platform ? { platform: options.platform } : {}),
        ...(sourceReferenceIds != null
          ? { id: { in: sourceReferenceIds } }
          : {}),
        isDeleted: false,
      },
    });

    const remixCounts = await this.getRemixCounts(
      docs.map((doc) => doc.id),
      organizationId,
      brandId,
    );

    return {
      items: docs.map((doc) =>
        this.toReferenceRecord(
          doc.id,
          doc.data as unknown as ReferenceRecordData,
          doc.createdAt,
          remixCounts,
        ),
      ),
      totalReferences: docs.length,
    };
  }

  async getTopReferenceAccounts(
    organizationId?: string,
    brandId?: string,
    options: {
      limit?: number;
      platform?: string;
    } = {},
  ): Promise<TrendSourceAccountResult> {
    const limit = this.normalizeLimit(
      options.limit,
      DEFAULT_REFERENCE_ACCOUNT_LIMIT,
    );

    type AccountKey = string; // `${platform}:${authorHandle}`
    const accountRows = await this.prisma.trendSourceReference.groupBy({
      _avg: { latestTrendViralityScore: true },
      _count: { _all: true },
      _max: { lastSeenAt: true },
      _sum: { currentEngagementTotal: true },
      by: ['platform', 'authorHandle'],
      orderBy: [
        { _avg: { latestTrendViralityScore: 'desc' } },
        { _count: { authorHandle: 'desc' } },
        { _sum: { currentEngagementTotal: 'desc' } },
      ],
      take: limit,
      where: {
        authorHandle: { not: null },
        isDeleted: false,
        platform: options.platform ? options.platform : { not: null },
      },
    } as never);

    const brandRemixCounts = await this.getBrandRemixCountsByAccount(
      organizationId,
      brandId,
      options.platform,
    );

    const accounts: TrendSourceAccountSummary[] = (
      accountRows as Array<{
        _avg?: { latestTrendViralityScore?: unknown };
        _count?: { _all?: unknown };
        _max?: { lastSeenAt?: Date | null };
        _sum?: { currentEngagementTotal?: unknown };
        authorHandle?: string | null;
        platform?: string | null;
      }>
    )
      .filter((row) => row.platform && row.authorHandle)
      .map((row) => {
        const key: AccountKey = `${row.platform}:${row.authorHandle}`;
        return {
          authorHandle: String(row.authorHandle),
          avgTrendViralityScore: Math.round(
            Number(row._avg?.latestTrendViralityScore ?? 0),
          ),
          brandRemixCount: brandRemixCounts.get(key) || 0,
          lastSeenAt: row._max?.lastSeenAt?.toISOString(),
          platform: String(row.platform),
          referenceCount: Number(row._count?._all ?? 0),
          totalEngagement: Number(row._sum?.currentEngagementTotal ?? 0),
        };
      });

    return {
      accounts,
      totalAccounts: accounts.length,
    };
  }

  async getCorpusFreshnessHealth(
    options: CorpusFreshnessHealthOptions = {},
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
        where: {
          ...(options.platform ? { platform: options.platform } : {}),
          isDeleted: false,
        },
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

  private buildFreshnessSegments(
    referenceDocs: ReferenceHealthDoc[],
    now: Date,
  ): TrendCorpusFreshnessSegment[] {
    const bySegment = new Map<string, FreshnessSegmentAccumulator>();

    for (const doc of referenceDocs) {
      const data = this.asRecord(doc.data) as ReferenceRecordData;
      const classification = this.resolveSourceClassification(
        data.sourceClassification,
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
  ): TrendSourceClassification | undefined {
    const record = this.asRecord(value);
    const sourceKind = this.readString(record.sourceKind);
    const intendedUse = this.readString(record.intendedUse);
    const freshnessWindowDays = this.readNumber(record.freshnessWindowDays);

    if (
      !this.isTrendSourceKind(sourceKind) ||
      !this.isTrendSourceIntendedUse(intendedUse)
    ) {
      return undefined;
    }

    return {
      capturedAt: this.readString(record.capturedAt) ?? '',
      confidence:
        record.confidence === 'high' ||
        record.confidence === 'low' ||
        record.confidence === 'medium'
          ? record.confidence
          : 'medium',
      freshnessWindowDays:
        freshnessWindowDays ??
        DEFAULT_FRESHNESS_WINDOW_DAYS_BY_SOURCE_KIND[sourceKind],
      intendedUse,
      sourceKind,
      sourceLabel: this.readString(record.sourceLabel),
      sourceTopic: this.readString(record.sourceTopic),
    };
  }

  private isTrendSourceKind(value: unknown): value is TrendSourceKind {
    return (
      typeof value === 'string' &&
      value in DEFAULT_FRESHNESS_WINDOW_DAYS_BY_SOURCE_KIND
    );
  }

  private isTrendSourceIntendedUse(
    value: unknown,
  ): value is TrendSourceIntendedUse {
    return typeof value === 'string' && TREND_SOURCE_INTENDED_USES.has(value);
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

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private async resolveSourceReferenceIds(
    metadata?: Record<string, unknown>,
  ): Promise<string[]> {
    const explicitIds = [
      ...this.parseStringArray(metadata?.sourceReferenceIds),
      ...this.parseOptionalString(metadata?.sourceReferenceId),
    ];
    if (explicitIds.length > 0) {
      return Array.from(new Set(explicitIds));
    }

    const sourceUrls = [
      ...this.parseStringArray(metadata?.sourceUrls),
      ...this.parseOptionalString(metadata?.sourceUrl),
    ];
    if (sourceUrls.length === 0) {
      return [];
    }

    const normalizedUrls = sourceUrls.map((url) =>
      this.normalizeSourceUrl(url),
    );

    const refs = await this.prisma.trendSourceReference.findMany({
      select: { id: true },
      take: normalizedUrls.length,
      where: {
        canonicalUrl: { in: normalizedUrls },
        isDeleted: false,
      },
    });

    return refs.map((doc) => doc.id);
  }

  private parseOptionalString(value: unknown): string[] {
    if (typeof value !== 'string' || value.length === 0) {
      return [];
    }

    return [value];
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
  }

  private normalizeSourceUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString().replace(/\/$/, '');
    } catch (error) {
      this.loggerService.warn('Failed to normalize source URL', {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
      return url.replace(/[?#].*$/, '').replace(/\/$/, '');
    }
  }

  private normalizeLimit(
    value: number | undefined,
    defaultLimit: number,
  ): number {
    if (!Number.isFinite(value) || value == null || value <= 0) {
      return defaultLimit;
    }

    return Math.min(Math.floor(value), MAX_REFERENCE_QUERY_LIMIT);
  }

  private getEngagementTotal(metrics?: TrendSourceItem['metrics']): number {
    return (
      (metrics?.comments || 0) +
      (metrics?.likes || 0) +
      (metrics?.shares || 0) +
      (metrics?.views || 0)
    );
  }

  private toSnapshotDate(): Date {
    const snapshotDate = new Date();
    snapshotDate.setUTCHours(0, 0, 0, 0);
    return snapshotDate;
  }

  private async getRemixCounts(
    sourceReferenceIds: string[],
    organizationId?: string,
    brandId?: string,
  ): Promise<Map<string, number>> {
    if (sourceReferenceIds.length === 0 || !organizationId || !brandId) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        remix_count: bigint | number | string;
        source_reference_id: string;
      }>
    >(
      Prisma.sql`
        SELECT
          refs."B" AS source_reference_id,
          COUNT(*) AS remix_count
        FROM "_remix_lineage_source_refs" refs
        INNER JOIN "trend_remix_lineages" lineage ON lineage."id" = refs."A"
        WHERE refs."B" = ANY(${sourceReferenceIds}::text[])
          AND lineage."organizationId" = ${organizationId}
          AND lineage."brandId" = ${brandId}
          AND lineage."isDeleted" = false
        GROUP BY refs."B"
      `,
    );

    return new Map(
      rows.map((row) => [
        row.source_reference_id,
        Number(row.remix_count ?? 0),
      ]),
    );
  }

  private async getBrandRemixCountsByAccount(
    organizationId?: string,
    brandId?: string,
    platform?: string,
  ): Promise<Map<string, number>> {
    if (!organizationId || !brandId) {
      return new Map();
    }

    const platformFilter = platform
      ? Prisma.sql`AND source_ref."platform" = ${platform}`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        author_handle: string;
        platform: string;
        remix_count: bigint | number | string;
      }>
    >(
      Prisma.sql`
        SELECT
          source_ref."platform" AS platform,
          source_ref."authorHandle" AS author_handle,
          COUNT(*) AS remix_count
        FROM "_remix_lineage_source_refs" refs
        INNER JOIN "trend_remix_lineages" lineage ON lineage."id" = refs."A"
        INNER JOIN "trend_source_references" source_ref ON source_ref."id" = refs."B"
        WHERE lineage."organizationId" = ${organizationId}
          AND lineage."brandId" = ${brandId}
          AND lineage."isDeleted" = false
          AND source_ref."isDeleted" = false
          AND source_ref."platform" IS NOT NULL
          AND source_ref."authorHandle" IS NOT NULL
          ${platformFilter}
        GROUP BY source_ref."platform", source_ref."authorHandle"
      `,
    );

    return new Map(
      rows.map((row) => [
        `${row.platform}:${row.author_handle}`,
        Number(row.remix_count ?? 0),
      ]),
    );
  }

  private toReferenceRecord(
    id: string,
    data: ReferenceRecordData,
    createdAt: Date,
    remixCounts: Map<string, number>,
  ): TrendSourceReferenceRecord {
    return {
      authorHandle: data.authorHandle,
      canonicalUrl: data.canonicalUrl,
      contentType: data.contentType,
      currentEngagementTotal: data.currentEngagementTotal,
      currentMetrics: data.currentMetrics,
      firstSeenAt: data.firstSeenAt ?? createdAt.toISOString(),
      id,
      lastSeenAt: data.lastSeenAt,
      latestTrendMentions: data.latestTrendMentions,
      latestTrendViralityScore: data.latestTrendViralityScore,
      matchedTrendTopics: data.matchedTrendTopics,
      mediaUrl: data.mediaUrl,
      platform: data.platform,
      publishedAt: data.publishedAt,
      remixCount: remixCounts.get(id) || 0,
      sourcePreviewState: data.sourcePreviewState,
      sourceClassification: data.sourceClassification,
      text: data.text,
      thumbnailUrl: data.thumbnailUrl,
      title: data.title,
    };
  }
}
