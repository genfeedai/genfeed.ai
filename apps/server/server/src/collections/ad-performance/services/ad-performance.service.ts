import type { Prisma } from '@genfeedai/prisma';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AdPerformance,
  AdPerformanceDocument,
} from '@server/collections/ad-performance/schemas/ad-performance.schema';
import {
  type AdPerformanceBenchmarkFields,
  buildAdPerformanceBenchmarkFields,
} from '@server/collections/ad-performance/utils/ad-performance-benchmark.util';
import {
  type AdPerformanceIdentityFields,
  buildAdPerformanceIdentityKey,
  resolveAdPerformanceIdentityFields,
} from '@server/collections/ad-performance/utils/ad-performance-identity.util';
import { SERVER_TOKENS, type ServerPrisma } from '@server/server.dependencies';
import { scopedWhere } from '@server/tenancy/scoped-where';

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
  industry?: string;
  scope?: string;
  metric?: string;
  limit?: number;
};

@Injectable()
export class AdPerformanceService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<ServerPrisma, 'adPerformance'>,
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

    if (scope) {
      where.scope = scope;
    }

    return where;
  }

  private buildScalarMetricWhere(
    where: Prisma.AdPerformanceWhereInput,
    metric: ScalarTopPerformerMetric,
  ): Prisma.AdPerformanceWhereInput {
    return {
      ...where,
      [metric]: { not: null },
    } as Prisma.AdPerformanceWhereInput;
  }

  private buildMetricOrderBy(
    metric: ScalarTopPerformerMetric,
  ): Prisma.AdPerformanceOrderByWithRelationInput[] {
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
  } {
    const normalizedData = JSON.parse(JSON.stringify(data)) as Record<
      string,
      unknown
    >;
    const brandId = this.readString(normalizedData.brandId) ?? null;
    const credentialId = this.readString(normalizedData.credentialId) ?? null;
    const organizationId = this.readString(normalizedData.organizationId);
    const identity = resolveAdPerformanceIdentityFields(data);

    if (!organizationId) {
      throw new Error('AdPerformance organizationId is required');
    }

    for (const key of AD_PERFORMANCE_IDENTITY_KEYS) {
      delete normalizedData[key];
    }

    return {
      benchmarkFields: buildAdPerformanceBenchmarkFields(normalizedData),
      brandId,
      credentialId,
      data: normalizedData,
      identity,
      identityKey: buildAdPerformanceIdentityKey(identity),
      organizationId,
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
  }) {
    return {
      ...payload.benchmarkFields,
      brandId: payload.brandId,
      credentialId: payload.credentialId,
      data: payload.data as never,
      date: payload.identity.date,
      externalAccountId: payload.identity.externalAccountId,
      externalAdId: payload.identity.externalAdId,
      externalAdSetId: payload.identity.externalAdSetId,
      externalCampaignId: payload.identity.externalCampaignId,
      granularity: payload.identity.granularity,
      identityKey: payload.identityKey,
      isDeleted: false,
      organizationId: payload.organizationId,
    };
  }

  async upsert(data: Record<string, unknown>): Promise<AdPerformanceDocument> {
    const payload = this.toPersistencePayload(data);
    const writeData = this.toWriteData(payload);
    // tenant-scope-ignore: organizationId is pinned; isDeleted is omitted so unique upsert restores tombstones
    const record = await this.prisma.adPerformance.upsert({
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
    let count = 0;
    for (
      let index = 0;
      index < records.length;
      index += UPSERT_BATCH_CHUNK_SIZE
    ) {
      const chunk = records.slice(index, index + UPSERT_BATCH_CHUNK_SIZE);
      await Promise.all(chunk.map((data) => this.upsert(data)));
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
      const records = await this.prisma.adPerformance.findMany({
        orderBy: this.buildMetricOrderBy(metric),
        take: limit,
        where: this.buildScalarMetricWhere(where, metric),
      });

      return records.map((record) => this.normalizeRecord(record));
    }

    // JSON-backed metrics, such as conversions, cannot be ordered by Prisma
    // without a new scalar column. Keep this fallback bounded so it never reads
    // the whole benchmark corpus for a normal top-performer request.
    const records = await this.prisma.adPerformance.findMany({
      orderBy: this.buildMetricOrderBy('performanceScore'),
      take: Math.max(limit, JSON_METRIC_CANDIDATE_LIMIT),
      where: {
        ...where,
        performanceScore: { not: null },
      },
    });

    return records
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

  async findPublicById(id: string): Promise<AdPerformanceDocument | null> {
    const record = await this.prisma.adPerformance.findFirst({
      where: { id, isDeleted: false, scope: 'public' },
    });

    return record ? this.normalizeRecord(record) : null;
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
            data: {
              ...this.readObjectRecord(record.data),
              scope: 'organization',
            } as never,
            scope: 'organization',
          },
          where: { id: record.id },
        }),
      ),
    );

    return records.length;
  }
}
