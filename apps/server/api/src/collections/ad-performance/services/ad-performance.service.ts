import type {
  AdPerformance,
  AdPerformanceDocument,
} from '@api/collections/ad-performance/schemas/ad-performance.schema';
import {
  type AdPerformanceBenchmarkFields,
  buildAdPerformanceBenchmarkFields,
} from '@api/collections/ad-performance/utils/ad-performance-benchmark.util';
import {
  type AdPerformanceIdentityFields,
  buildAdPerformanceIdentityKeyFromData,
  readAdPerformanceDate,
  resolveAdPerformanceIdentityFields,
} from '@api/collections/ad-performance/utils/ad-performance-identity.util';
import { SERVER_TOKENS, type ServerPrisma } from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { PAID_CREATIVE_RESEARCH_SOURCES } from '@genfeedai/integrations/ads';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { Inject, Injectable } from '@nestjs/common';

const DEFAULT_PAGE_SIZE = 50;
const UPSERT_BATCH_CHUNK_SIZE = 50;
const DEFAULT_TOP_PERFORMER_LIMIT = 10;
const MIN_TOP_PERFORMER_LIMIT = 1;
const MAX_TOP_PERFORMER_LIMIT = 100;
const JSON_METRIC_CANDIDATE_LIMIT = 500;
const AD_PERFORMANCE_IDENTITY_KEYS = [
  'brand',
  'brandId',
  'credential',
  'credentialId',
  'organization',
  'organizationId',
] as const;
/**
 * Rows carrying one of these `researchSource` values are a tenant's own
 * competitor-research snapshot, never part of the cross-organization public
 * corpus. Keeping this as a set (rather than the single X source it started
 * as) is what lets Meta, TikTok, and Google transparency ingestion share one
 * pool without leaking one tenant's watchlist into another's Discover feed.
 */
const TENANT_RESEARCH_SOURCES: string[] = [...PAID_CREATIVE_RESEARCH_SOURCES];

const AD_PERFORMANCE_RESEARCH_KEYS = [
  'researchFreshnessState',
  'researchObservedAt',
  'researchSnapshotId',
  'researchSnapshotKey',
  'researchSource',
] as const;

const SCALAR_TOP_PERFORMER_METRICS = [
  'performanceScore',
  'ctr',
  'roas',
  'cpc',
  'cpa',
  'conversionRate',
  'spend',
  'dataConfidence',
] as const;

type ScalarTopPerformerMetric = (typeof SCALAR_TOP_PERFORMER_METRICS)[number];

type TopPerformerParams = {
  adPlatform?: string;
  brandId?: string;
  industry?: string;
  organizationId?: string;
  scope?: string;
  metric?: string;
  limit?: number;
};

@Injectable()
export class AdPerformanceService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<
      ServerPrisma,
      '$transaction' | 'adPerformance' | 'adWatchedAdvertiser'
    >,
  ) {}

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private isScalarTopPerformerMetric(
    metric: string,
  ): metric is ScalarTopPerformerMetric {
    return SCALAR_TOP_PERFORMER_METRICS.includes(
      metric as ScalarTopPerformerMetric,
    );
  }

  private resolveTopPerformerLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit)) {
      return DEFAULT_TOP_PERFORMER_LIMIT;
    }

    return Math.min(
      MAX_TOP_PERFORMER_LIMIT,
      Math.max(MIN_TOP_PERFORMER_LIMIT, Math.trunc(limit)),
    );
  }

  private buildTopPerformerWhere(
    params: TopPerformerParams,
  ): Prisma.AdPerformanceWhereInput {
    const where: Prisma.AdPerformanceWhereInput = {
      isDeleted: false,
    };
    const adPlatform = this.readString(params.adPlatform);
    const industry = this.readString(params.industry);
    const scope = this.readString(params.scope);

    if (adPlatform) {
      where.adPlatform = adPlatform;
    }

    if (industry) {
      where.industry = industry;
    }

    if (scope === 'public' && params.organizationId) {
      where.OR = this.buildResearchVisibilityWhere(
        params.organizationId,
        params.brandId,
      );
    } else if (scope) {
      where.scope = scope;
    }

    return where;
  }

  /**
   * Public Discover mixes a global benchmark corpus with tenant-owned
   * repository rows. The outer `organizationId` pin from `scopedWhere` would
   * hide every public row ingested under another org.
   */
  private resolveDiscoverRankingWhere(
    params: TopPerformerParams,
    where: Prisma.AdPerformanceWhereInput,
  ): Prisma.AdPerformanceWhereInput {
    if (this.readString(params.scope) === 'public') {
      // tenant-scope-ignore: global public benchmark rows are cross-org;
      // tenant research rows are already pinned inside buildResearchVisibilityWhere
      return where;
    }

    if (params.organizationId) {
      return scopedWhere(params.organizationId, where);
    }

    // tenant-scope-ignore: public ranking with no session org
    return where;
  }

  private buildResearchVisibilityWhere(
    organizationId: string,
    brandId?: string,
  ): Prisma.AdPerformanceWhereInput[] {
    return [
      this.buildGlobalPublicVisibilityWhere(),
      {
        ...(brandId
          ? { OR: [{ brandId }, { brandId: null }] }
          : { brandId: null }),
        organizationId,
        researchFreshnessState: 'fresh',
        researchSource: { in: TENANT_RESEARCH_SOURCES },
        scope: 'organization',
      },
    ];
  }

  private buildGlobalPublicVisibilityWhere(): Prisma.AdPerformanceWhereInput {
    return {
      OR: [
        { researchSource: null },
        { researchSource: { notIn: TENANT_RESEARCH_SOURCES } },
      ],
      scope: 'public',
    };
  }

  private buildScalarMetricWhere(
    where: Prisma.AdPerformanceWhereInput,
    metric: ScalarTopPerformerMetric,
    params: TopPerformerParams,
  ): Prisma.AdPerformanceWhereInput {
    if (
      metric === 'performanceScore' &&
      params.organizationId &&
      params.scope === 'public'
    ) {
      return {
        ...where,
        AND: [
          {
            OR: [
              { performanceScore: { not: null } },
              {
                ...(params.brandId
                  ? {
                      OR: [{ brandId: params.brandId }, { brandId: null }],
                    }
                  : { brandId: null }),
                organizationId: params.organizationId,
                performanceScore: null,
                researchFreshnessState: 'fresh',
                researchSource: { in: TENANT_RESEARCH_SOURCES },
                scope: 'organization',
              },
            ],
          },
        ],
      };
    }

    return {
      ...where,
      [metric]: { not: null },
    } as Prisma.AdPerformanceWhereInput;
  }

  private buildMetricOrderBy(
    metric: ScalarTopPerformerMetric,
  ): Prisma.AdPerformanceOrderByWithRelationInput[] {
    if (metric === 'performanceScore') {
      return [
        { performanceScore: { nulls: 'last', sort: 'desc' } },
        { updatedAt: 'desc' },
      ];
    }

    return [
      { [metric]: 'desc' },
      { updatedAt: 'desc' },
    ] as Prisma.AdPerformanceOrderByWithRelationInput[];
  }

  private normalizeRecord(record: AdPerformance): AdPerformanceDocument {
    const data = { ...this.readObjectRecord(record.data) };

    for (const key of AD_PERFORMANCE_IDENTITY_KEYS) {
      delete data[key];
    }
    for (const key of AD_PERFORMANCE_RESEARCH_KEYS) {
      delete data[key];
    }

    return {
      ...data,
      ...record,
      data,
    } as AdPerformanceDocument;
  }

  private toPersistencePayload(data: Record<string, unknown>): {
    brandId: string | null;
    benchmarkFields: AdPerformanceBenchmarkFields;
    credentialId: string | null;
    data: Record<string, unknown>;
    identity: AdPerformanceIdentityFields;
    identityKey: string;
    organizationId: string;
    researchFreshnessState: string | null;
    researchObservedAt: Date | null;
    researchSnapshotId: string | null;
    researchSnapshotKey: string | null;
    researchSource: string | null;
  } {
    const normalizedData = JSON.parse(JSON.stringify(data)) as Record<
      string,
      unknown
    >;
    const brandId = this.readString(normalizedData.brandId) ?? null;
    const credentialId = this.readString(normalizedData.credentialId) ?? null;
    const organizationId = this.readString(normalizedData.organizationId);
    const identity = resolveAdPerformanceIdentityFields(data);
    const researchFreshnessState =
      this.readString(normalizedData.researchFreshnessState) ?? null;
    const researchObservedAt = readAdPerformanceDate(
      normalizedData.researchObservedAt,
    );
    const researchSnapshotId =
      this.readString(normalizedData.researchSnapshotId) ?? null;
    const researchSnapshotKey =
      this.readString(normalizedData.researchSnapshotKey) ?? null;
    const researchSource =
      this.readString(normalizedData.researchSource) ?? null;

    if (!organizationId) {
      throw new Error('AdPerformance organizationId is required');
    }

    for (const key of AD_PERFORMANCE_IDENTITY_KEYS) {
      delete normalizedData[key];
    }
    for (const key of AD_PERFORMANCE_RESEARCH_KEYS) {
      delete normalizedData[key];
    }

    return {
      benchmarkFields: buildAdPerformanceBenchmarkFields(normalizedData),
      brandId,
      credentialId,
      data: normalizedData,
      identity,
      identityKey: buildAdPerformanceIdentityKeyFromData(data),
      organizationId,
      researchFreshnessState,
      researchObservedAt,
      researchSnapshotId,
      researchSnapshotKey,
      researchSource,
    };
  }

  private toWriteData(payload: {
    brandId: string | null;
    benchmarkFields: AdPerformanceBenchmarkFields;
    credentialId: string | null;
    data: Record<string, unknown>;
    identity: AdPerformanceIdentityFields;
    identityKey: string;
    organizationId: string;
    researchFreshnessState: string | null;
    researchObservedAt: Date | null;
    researchSnapshotId: string | null;
    researchSnapshotKey: string | null;
    researchSource: string | null;
  }) {
    return {
      ...payload.benchmarkFields,
      brandId: payload.brandId,
      credentialId: payload.credentialId,
      data: toPrismaJson(payload.data),
      date: payload.identity.date,
      externalAccountId: payload.identity.externalAccountId,
      externalAdId: payload.identity.externalAdId,
      externalAdSetId: payload.identity.externalAdSetId,
      externalCampaignId: payload.identity.externalCampaignId,
      granularity: payload.identity.granularity,
      identityKey: payload.identityKey,
      isDeleted: false,
      organizationId: payload.organizationId,
      researchFreshnessState: payload.researchFreshnessState,
      researchObservedAt: payload.researchObservedAt,
      researchSnapshotId: payload.researchSnapshotId,
      researchSnapshotKey: payload.researchSnapshotKey,
      researchSource: payload.researchSource,
    };
  }

  async upsert(data: Record<string, unknown>): Promise<AdPerformanceDocument> {
    return this.upsertWithDelegate(data, this.prisma.adPerformance);
  }

  private async upsertWithDelegate(
    data: Record<string, unknown>,
    delegate: Prisma.TransactionClient['adPerformance'],
  ): Promise<AdPerformanceDocument> {
    const payload = this.toPersistencePayload(data);
    const writeData = this.toWriteData(payload);
    // tenant-scope-ignore: organizationId is pinned; isDeleted is omitted so unique upsert restores tombstones
    const record = await delegate.upsert({
      create: writeData,
      update: writeData,
      // Unique selector must omit isDeleted so a tombstone can match and restore.
      where: {
        organizationId: payload.organizationId,
        organizationId_identityKey: {
          identityKey: payload.identityKey,
          organizationId: payload.organizationId,
        },
      },
    });

    return this.normalizeRecord(record);
  }

  async upsertBatch(records: Record<string, unknown>[]): Promise<number> {
    return this.upsertBatchWithDelegate(records, this.prisma.adPerformance);
  }

  private async upsertBatchWithDelegate(
    records: Record<string, unknown>[],
    delegate: Prisma.TransactionClient['adPerformance'],
  ): Promise<number> {
    let count = 0;
    for (
      let index = 0;
      index < records.length;
      index += UPSERT_BATCH_CHUNK_SIZE
    ) {
      const chunk = records.slice(index, index + UPSERT_BATCH_CHUNK_SIZE);
      await Promise.all(
        chunk.map((data) => this.upsertWithDelegate(data, delegate)),
      );
      count += chunk.length;
    }
    return count;
  }

  async findByOrganization(
    organizationId: string,
    params: {
      adPlatform?: string;
      startDate?: Date;
      endDate?: Date;
      granularity?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<AdPerformanceDocument[]> {
    const adPlatform = this.readString(params.adPlatform);
    const granularity = this.readString(params.granularity);
    const dateFilter =
      params.startDate || params.endDate
        ? {
            ...(params.startDate ? { gte: params.startDate } : {}),
            ...(params.endDate ? { lte: params.endDate } : {}),
          }
        : undefined;

    const records = await this.prisma.adPerformance.findMany({
      orderBy: { date: { nulls: 'last', sort: 'desc' } },
      skip: params.offset ?? 0,
      take: params.limit ?? DEFAULT_PAGE_SIZE,
      where: scopedWhere(organizationId, {
        ...(adPlatform ? { adPlatform } : {}),
        ...(dateFilter ? { date: dateFilter } : {}),
        ...(granularity ? { granularity } : {}),
      }),
    });

    return records.map((record) => this.normalizeRecord(record));
  }

  async findTopPerformers(
    params: TopPerformerParams,
  ): Promise<AdPerformanceDocument[]> {
    // An explicit non-positive limit means the caller wants nothing — return
    // early instead of clamping up to the minimum and reading the corpus.
    if (params.limit !== undefined && params.limit <= 0) {
      return [];
    }

    const metric = params.metric ?? 'performanceScore';
    const limit = this.resolveTopPerformerLimit(params.limit);

    const where = this.buildTopPerformerWhere(params);

    if (this.isScalarTopPerformerMetric(metric)) {
      const metricWhere = this.buildScalarMetricWhere(where, metric, params);
      // Tenant research rows are already pinned inside
      // buildResearchVisibilityWhere; only the global corpus is read cross-org.
      // tenant-scope-ignore: global public benchmark rows are cross-org
      const records = await this.prisma.adPerformance.findMany({
        orderBy: this.buildMetricOrderBy(metric),
        take: limit,
        where: this.resolveDiscoverRankingWhere(params, metricWhere),
      });

      return records.map((record) => this.normalizeRecord(record));
    }

    // JSON-backed metrics, such as conversions, cannot be ordered by Prisma
    // without a new scalar column. Keep this fallback bounded so it never reads
    // the whole benchmark corpus for a normal top-performer request.
    const jsonWhere = {
      ...where,
      performanceScore: { not: null },
    };
    // Tenant research rows are already pinned inside
    // buildResearchVisibilityWhere; only the global corpus is read cross-org.
    // tenant-scope-ignore: global public benchmark rows are cross-org
    const jsonRecords = await this.prisma.adPerformance.findMany({
      orderBy: this.buildMetricOrderBy('performanceScore'),
      take: Math.max(limit, JSON_METRIC_CANDIDATE_LIMIT),
      where: this.resolveDiscoverRankingWhere(params, jsonWhere),
    });

    return jsonRecords
      .map((record) => this.normalizeRecord(record))
      .sort((a, b) => {
        const aMetric = this.readNumber(a[metric]) ?? 0;
        const bMetric = this.readNumber(b[metric]) ?? 0;
        return bMetric - aMetric;
      })
      .slice(0, limit);
  }

  async findById(
    id: string,
    organizationId: string,
  ): Promise<AdPerformanceDocument | null> {
    const record = await this.prisma.adPerformance.findFirst({
      where: scopedWhere(organizationId, { id }),
    });

    return record ? this.normalizeRecord(record) : null;
  }

  async findPublicById(
    id: string,
    organizationId?: string,
    brandId?: string,
  ): Promise<AdPerformanceDocument | null> {
    if (organizationId) {
      // Tenant research rows are already pinned inside
      // buildResearchVisibilityWhere; only the global corpus is read cross-org.
      // tenant-scope-ignore: global public benchmark rows are cross-org
      const record = await this.prisma.adPerformance.findFirst({
        where: {
          id,
          isDeleted: false,
          OR: this.buildResearchVisibilityWhere(organizationId, brandId),
        },
      });

      return record ? this.normalizeRecord(record) : null;
    }

    // tenant-scope-ignore: public Discover lookup is unscoped until a session org is supplied
    const record = await this.prisma.adPerformance.findFirst({
      where: {
        id,
        isDeleted: false,
        ...this.buildGlobalPublicVisibilityWhere(),
      },
    });

    return record ? this.normalizeRecord(record) : null;
  }

  /**
   * Replaces one tenant-owned research snapshot and retires rows that were not
   * observed in the replacement. An empty successful snapshot therefore
   * clears the prior result instead of presenting it as current.
   */
  async replaceResearchSnapshot(params: {
    expectedBrandId: string | null;
    observedAt: Date;
    organizationId: string;
    records: Record<string, unknown>[];
    researchSource: string;
    snapshotId: string;
    snapshotKey: string;
  }): Promise<{ applied: boolean; recordCount: number }> {
    if (Number.isNaN(params.observedAt.getTime())) {
      throw new Error('Research snapshot observedAt must be a valid date');
    }

    const identityKeys = params.records.map((record) => {
      const recordObservedAt = readAdPerformanceDate(record.researchObservedAt);
      if (
        record.organizationId !== params.organizationId ||
        record.researchSnapshotId !== params.snapshotId ||
        record.researchSnapshotKey !== params.snapshotKey ||
        record.researchSource !== params.researchSource ||
        recordObservedAt?.getTime() !== params.observedAt.getTime()
      ) {
        throw new Error(
          'Research snapshot records must match the requested tenant and snapshot key',
        );
      }

      return this.toPersistencePayload(record).identityKey;
    });

    return this.prisma.$transaction(
      async (transaction) => {
        const watchedAdvertiser =
          await transaction.adWatchedAdvertiser.findFirst({
            select: {
              brandId: true,
              id: true,
              lastSnapshotId: true,
              lastSuccessfulAt: true,
            },
            where: {
              id: params.snapshotKey,
              isDeleted: false,
              organizationId: params.organizationId,
            },
          });
        if (!watchedAdvertiser) {
          throw new Error('Research snapshot watch scope was not found');
        }

        if (watchedAdvertiser.brandId !== params.expectedBrandId) {
          throw new Error(
            'Research snapshot expected brand does not match the watched advertiser',
          );
        }

        if (
          params.records.some(
            (record) => (record.brandId ?? null) !== params.expectedBrandId,
          )
        ) {
          throw new Error(
            'Research snapshot records must match the watched advertiser brand',
          );
        }

        if (
          watchedAdvertiser.lastSuccessfulAt &&
          watchedAdvertiser.lastSuccessfulAt.getTime() >=
            params.observedAt.getTime()
        ) {
          return { applied: false, recordCount: 0 };
        }

        await this.upsertBatchWithDelegate(
          params.records,
          transaction.adPerformance,
        );
        await this.retireMissingResearchSnapshotRows(
          transaction.adPerformance,
          params.organizationId,
          params.snapshotKey,
          params.researchSource,
          params.expectedBrandId,
          params.observedAt,
          identityKeys,
        );

        const watchTransition =
          await transaction.adWatchedAdvertiser.updateMany({
            data: {
              freshnessState: params.records.length === 0 ? 'empty' : 'fresh',
              lastAttemptedAt: params.observedAt,
              lastIngestionErrorCode: null,
              lastIngestionStatus: 'success',
              lastSnapshotId: params.snapshotId,
              lastSnapshotRecordCount: params.records.length,
              lastSuccessfulAt: params.observedAt,
            },
            where: {
              OR: [
                { lastSuccessfulAt: null },
                { lastSuccessfulAt: { lt: params.observedAt } },
              ],
              id: params.snapshotKey,
              isDeleted: false,
              organizationId: params.organizationId,
              brandId: params.expectedBrandId,
            },
          });
        if (watchTransition.count !== 1) {
          throw new Error('Research snapshot was superseded concurrently');
        }

        return { applied: true, recordCount: params.records.length };
      },
      { isolationLevel: 'Serializable' },
    );
  }

  private async retireMissingResearchSnapshotRows(
    delegate: Prisma.TransactionClient['adPerformance'],
    organizationId: string,
    snapshotKey: string,
    researchSource: string,
    brandId: string | null,
    observedAt: Date,
    retainedIdentityKeys: string[] = [],
  ): Promise<number> {
    const result = await delegate.updateMany({
      data: { isDeleted: true },
      where: scopedWhere(organizationId, {
        OR: [
          { researchObservedAt: { lte: observedAt } },
          { researchObservedAt: null },
        ],
        brandId,
        researchSnapshotKey: snapshotKey,
        researchSource,
        ...(retainedIdentityKeys.length > 0
          ? { identityKey: { notIn: retainedIdentityKeys } }
          : {}),
      }),
    });

    return result.count;
  }

  /**
   * Preserve last-known rows after a failed/unavailable refresh, but mark them
   * stale so organization-scoped research reads exclude them.
   */
  async markResearchSnapshotStale(
    organizationId: string,
    snapshotKey: string,
    researchSource: string,
  ): Promise<number> {
    const result = await this.prisma.adPerformance.updateMany({
      data: { researchFreshnessState: 'stale' },
      where: scopedWhere(organizationId, {
        researchSnapshotKey: snapshotKey,
        researchSource,
      }),
    });

    return result.count;
  }

  async findLatestSyncDateForCredential(
    credentialId: string,
  ): Promise<Date | null> {
    // tenant-scope-ignore: credential ids are globally unique and this internal sync cursor lookup returns only the latest scalar date for that credential
    const record = await this.prisma.adPerformance.findFirst({
      orderBy: { date: { sort: 'desc' } },
      select: { date: true },
      where: { credentialId, date: { not: null }, isDeleted: false },
    });

    return record?.date ?? null;
  }

  async removeOrgFromAggregation(organizationId: string): Promise<number> {
    // sql-risk-audit: documented unbounded-read -- Privacy revocation intentionally rewrites every ad performance row for one organization.
    const records = await this.prisma.adPerformance.findMany({
      where: { organizationId },
    });

    await Promise.all(
      records.map((record) =>
        this.prisma.adPerformance.update({
          data: {
            data: toPrismaJson({
              ...this.readObjectRecord(record.data),
              scope: 'organization',
            }),
            scope: 'organization',
          },
          where: scopedWhere(organizationId, { id: record.id }),
        }),
      ),
    );

    return records.length;
  }
}
