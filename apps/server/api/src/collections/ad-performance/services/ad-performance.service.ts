import type {
  AdPerformance,
  AdPerformanceDocument,
} from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdPerformanceService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
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

  async findTopPerformers(params: {
    adPlatform?: string;
    industry?: string;
    scope?: string;
    metric?: string;
    limit?: number;
  }): Promise<AdPerformanceDocument[]> {
    const metric = params.metric ?? 'performanceScore';
    const records = await this.prisma.adPerformance.findMany({
      where: {
        isDeleted: false,
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
          params.industry &&
          this.readString(record.industry) !== params.industry
        ) {
          return false;
        }

        if (params.scope && this.readString(record.scope) !== params.scope) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aMetric = this.readNumber(a[metric]) ?? 0;
        const bMetric = this.readNumber(b[metric]) ?? 0;
        return bMetric - aMetric;
      })
      .slice(0, params.limit ?? 10);
  }

  async findById(id: string): Promise<AdPerformanceDocument | null> {
    const record = await this.prisma.adPerformance.findFirst({
      where: { id, isDeleted: false },
    });

    return record ? this.normalizeRecord(record) : null;
  }

  async findLatestSyncDateForCredential(
    credentialId: string,
  ): Promise<Date | null> {
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
