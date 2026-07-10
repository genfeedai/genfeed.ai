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
import { SERVER_TOKENS, type ServerPrisma } from '@server/server.dependencies';

const DEFAULT_TOP_PERFORMER_LIMIT = 10;
const JSON_METRIC_CANDIDATE_LIMIT = 500;

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

  private readDate(value: unknown): Date | undefined {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    return undefined;
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

    return Math.max(0, Math.trunc(limit));
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
    const data = this.readObjectRecord(record.data);

    return {
      ...record,
      ...data,
      _id: record.mongoId ?? record.id,
      brand: record.brandId,
      credential: record.credentialId,
      data,
      organization: record.organizationId,
    } as AdPerformanceDocument;
  }

  private toPersistencePayload(data: Record<string, unknown>): {
    brandId: string | null;
    benchmarkFields: AdPerformanceBenchmarkFields;
    credentialId: string | null;
    data: Record<string, unknown>;
    organizationId: string;
  } {
    const normalizedData = JSON.parse(JSON.stringify(data)) as Record<
      string,
      unknown
    >;
    const organizationId =
      this.readString(data.organizationId) ??
      this.readString(data.organization);

    if (!organizationId) {
      throw new Error('AdPerformance organizationId is required');
    }

    return {
      benchmarkFields: buildAdPerformanceBenchmarkFields(normalizedData),
      brandId:
        this.readString(data.brandId) ?? this.readString(data.brand) ?? null,
      credentialId:
        this.readString(data.credentialId) ??
        this.readString(data.credential) ??
        null,
      data: normalizedData,
      organizationId,
    };
  }

  private matchesUpsertKey(
    record: AdPerformanceDocument,
    key: Record<string, unknown>,
  ): boolean {
    const date = this.readDate(record.date);
    const keyDate = this.readDate(key.date);

    return (
      this.readString(record.adPlatform) === this.readString(key.adPlatform) &&
      this.readString(record.externalAccountId) ===
        this.readString(key.externalAccountId) &&
      this.readString(record.granularity) ===
        this.readString(key.granularity) &&
      (date?.getTime() ?? null) === (keyDate?.getTime() ?? null) &&
      this.readString(record.externalCampaignId) ===
        this.readString(key.externalCampaignId) &&
      this.readString(record.externalAdSetId) ===
        this.readString(key.externalAdSetId) &&
      this.readString(record.externalAdId) === this.readString(key.externalAdId)
    );
  }

  async upsert(data: Record<string, unknown>): Promise<AdPerformanceDocument> {
    const key = this.buildUpsertKey(data);
    const payload = this.toPersistencePayload(data);
    // sql-risk-audit: documented unbounded-read -- Upsert key fields are still JSON-backed; organizationId/isDeleted bounds this sync-path lookup until scalar key columns exist.
    const existing = (
      await this.prisma.adPerformance.findMany({
        where: {
          isDeleted: false,
          organizationId: payload.organizationId,
        },
      })
    )
      .map((record) => this.normalizeRecord(record))
      .find((record) => this.matchesUpsertKey(record, key));

    if (existing) {
      const updated = await this.prisma.adPerformance.update({
        data: {
          ...payload.benchmarkFields,
          brandId: payload.brandId,
          credentialId: payload.credentialId,
          data: payload.data as never,
          organizationId: payload.organizationId,
        },
        where: { id: existing.id },
      });

      return this.normalizeRecord(updated);
    }

    const created = await this.prisma.adPerformance.create({
      data: {
        ...payload.benchmarkFields,
        brandId: payload.brandId,
        credentialId: payload.credentialId,
        data: payload.data as never,
        organizationId: payload.organizationId,
      },
    });

    return this.normalizeRecord(created);
  }

  async upsertBatch(records: Record<string, unknown>[]): Promise<number> {
    let count = 0;
    for (const data of records) {
      await this.upsert(data);
      count++;
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
    // sql-risk-audit: documented unbounded-read -- This org-scoped optimization path still filters JSON-only date/granularity fields until those fields are scalarized.
    const records = await this.prisma.adPerformance.findMany({
      where: {
        isDeleted: false,
        organizationId,
      },
    });

    return records
      .map((record) => this.normalizeRecord(record))
      .filter((record) => {
        if (
          params.adPlatform &&
          this.readString(record.adPlatform) !== params.adPlatform
        ) {
          return false;
        }

        if (
          params.granularity &&
          this.readString(record.granularity) !== params.granularity
        ) {
          return false;
        }

        const date = this.readDate(record.date);
        if (params.startDate && (!date || date < params.startDate)) {
          return false;
        }

        if (params.endDate && (!date || date > params.endDate)) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aDate = this.readDate(a.date)?.getTime() ?? 0;
        const bDate = this.readDate(b.date)?.getTime() ?? 0;
        return bDate - aDate;
      })
      .slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50));
  }

  async findTopPerformers(
    params: TopPerformerParams,
  ): Promise<AdPerformanceDocument[]> {
    const metric = params.metric ?? 'performanceScore';
    const limit = this.resolveTopPerformerLimit(params.limit);
    if (limit === 0) {
      return [];
    }

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

  async findById(id: string): Promise<AdPerformanceDocument | null> {
    const record = await this.prisma.adPerformance.findFirst({
      where: { id, isDeleted: false },
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
    // sql-risk-audit: documented unbounded-read -- Latest sync date is JSON-backed, so the scheduler needs the credential slice until date becomes scalar/indexed.
    const records = await this.prisma.adPerformance.findMany({
      where: { credentialId, isDeleted: false },
    });

    return (
      records
        .map((record) => this.readDate(this.normalizeRecord(record).date))
        .filter((value): value is Date => Boolean(value))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    );
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

  private buildUpsertKey(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const key: Record<string, unknown> = {
      adPlatform: data.adPlatform,
      date: data.date,
      externalAccountId: data.externalAccountId,
      granularity: data.granularity,
    };

    switch (data.granularity) {
      case 'campaign':
        key.externalCampaignId = data.externalCampaignId;
        break;
      case 'adset':
        key.externalAdSetId = data.externalAdSetId ?? data.externalAdGroupId;
        break;
      case 'ad':
        key.externalAdId = data.externalAdId;
        break;
    }

    return key;
  }
}
