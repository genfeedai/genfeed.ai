import type {
  CreativePattern,
  CreativePatternDocument,
} from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import {
  buildPaginatedResult,
  type PaginatedResult,
} from '@api/helpers/utils/paginated-result/paginated-result.util';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PatternType } from '@genfeedai/contracts/interfaces';
import { Prisma, toPrismaJson } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

/**
 * `avgPerformanceScore` lives in the `data` JSON column, which Prisma cannot
 * order on, so score ranking (`findTopForBrand`, `findRanked`) happens over a
 * bounded window of the organization's freshest patterns rather than every
 * row. The paginated list (`findAll`) never ranks: it filters, orders, counts
 * and slices in the database.
 */
const PATTERN_CANDIDATE_LIMIT = 500;
const DEFAULT_RANKED_PATTERN_LIMIT = 100;
const DEFAULT_TOP_PATTERN_LIMIT = 10;

export interface CreativePatternListFilters {
  organizationId: string;
  brandId?: string;
  patternType?: PatternType;
  platform?: string;
  scope?: string;
}

export interface CreativePatternRankedFilters
  extends CreativePatternListFilters {
  limit?: number;
}

export interface CreativePatternPageWindow {
  limit: number;
  page: number;
}

@Injectable()
export class CreativePatternsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private normalizeRecord(record: CreativePattern): CreativePatternDocument {
    const data = this.readObjectRecord(record.data);

    return {
      ...record,
      ...data,
      brand: record.brandId,
      data,
      organization: record.organizationId,
    } as CreativePatternDocument;
  }

  private toPersistencePayload(data: Record<string, unknown>): {
    brandId: string | null;
    data: Record<string, unknown>;
    organizationId: string;
  } {
    const normalizedData = JSON.parse(JSON.stringify(data)) as Record<
      string,
      unknown
    >;
    const organizationId = this.readString(data.organizationId);

    if (!organizationId) {
      throw new Error('CreativePattern organizationId is required');
    }

    return {
      brandId: this.readString(data.brandId) ?? null,
      data: normalizedData,
      organizationId,
    };
  }

  async upsertPattern(
    data: Record<string, unknown>,
    client: Pick<Prisma.TransactionClient, 'creativePattern'> = this.prisma,
  ): Promise<CreativePatternDocument> {
    const payload = this.toPersistencePayload(data);
    const identityFilters: Prisma.CreativePatternWhereInput[] = [];
    for (const key of [
      'formula',
      'industry',
      'patternType',
      'platform',
      'scope',
    ] as const) {
      const value = this.readString(data[key]);
      if (value) {
        identityFilters.push({ data: { equals: value, path: [key] } });
      }
    }
    const existing = (
      await client.creativePattern.findMany({
        where: scopedWhere(payload.organizationId, {
          ...(identityFilters.length > 0 ? { AND: identityFilters } : {}),
          brandId: payload.brandId,
        }),
      })
    )
      .map((record) => this.normalizeRecord(record))
      .find(
        (record) =>
          (this.readString(record.brandId) ?? null) === payload.brandId &&
          this.readString(record.industry) === this.readString(data.industry) &&
          this.readString(record.patternType) ===
            this.readString(data.patternType) &&
          this.readString(record.platform) === this.readString(data.platform) &&
          this.readString(record.scope) === this.readString(data.scope),
      );

    if (existing) {
      const updated = await client.creativePattern.update({
        data: {
          brandId: payload.brandId,
          data: toPrismaJson(payload.data),
          organizationId: payload.organizationId,
        },
        where: scopedWhere(payload.organizationId, { id: existing.id }),
      });

      return this.normalizeRecord(updated);
    }

    const created = await client.creativePattern.create({
      data: {
        brandId: payload.brandId,
        data: toPrismaJson(payload.data),
        organizationId: payload.organizationId,
      },
    });

    return this.normalizeRecord(created);
  }

  async findTopForBrand(
    orgId: string,
    brandId: string,
    options?: { limit?: number; patternTypes?: PatternType[] },
  ): Promise<CreativePatternDocument[]> {
    const limit = options?.limit ?? DEFAULT_TOP_PATTERN_LIMIT;
    const now = new Date();
    const dataFilters: Prisma.CreativePatternWhereInput[] = [
      {
        OR: [
          { data: { equals: 'public', path: ['scope'] } },
          { data: { equals: 'private', path: ['scope'] } },
        ],
      },
    ];
    if (options?.patternTypes?.length) {
      dataFilters.push({
        OR: options.patternTypes.map((patternType) => ({
          data: { equals: patternType, path: ['patternType'] },
        })),
      });
    }
    const patterns = await this.prisma.creativePattern.findMany({
      orderBy: { updatedAt: 'desc' },
      take: PATTERN_CANDIDATE_LIMIT,
      where: scopedWhere(orgId, {
        AND: dataFilters,
        OR: [{ brandId }, { brandId: null }],
      }),
    });

    return patterns
      .map((record) => this.normalizeRecord(record))
      .filter((record) => {
        const validUntil = this.readDate(record.validUntil);
        return !validUntil || validUntil >= now;
      })
      .sort((a, b) => {
        const aScore = this.readNumber(a.avgPerformanceScore) ?? 0;
        const bScore = this.readNumber(b.avgPerformanceScore) ?? 0;
        return bScore - aScore;
      })
      .slice(0, limit);
  }

  /**
   * Row-level filters over the `data` JSON column, shared by the paginated
   * list and the ranked window so both agree on what a visible pattern is.
   */
  private buildDataFilters(
    filters: Omit<CreativePatternListFilters, 'organizationId'>,
  ): Prisma.CreativePatternWhereInput[] {
    const dataFilters: Prisma.CreativePatternWhereInput[] = [];
    if (filters.platform) {
      dataFilters.push({
        data: { equals: filters.platform, path: ['platform'] },
      });
    }
    if (filters.patternType) {
      dataFilters.push({
        data: { equals: filters.patternType, path: ['patternType'] },
      });
    }
    if (filters.scope) {
      dataFilters.push({
        data: { equals: filters.scope, path: ['scope'] },
      });
    }

    return dataFilters;
  }

  /**
   * Patterns without a `validUntil` never expire. Expiry is stored as an ISO
   * string, which orders chronologically, so the cut-off is a database filter.
   */
  private buildNotExpiredFilter(now: Date): Prisma.CreativePatternWhereInput {
    return {
      OR: [
        { data: { equals: Prisma.AnyNull, path: ['validUntil'] } },
        { data: { gte: now.toISOString(), path: ['validUntil'] } },
      ],
    };
  }

  /**
   * One page of the organization's unexpired patterns, freshest first. The
   * filter, order, count and skip/take all run in the database.
   */
  async findAll(
    filters: CreativePatternListFilters,
    { limit, page }: CreativePatternPageWindow,
  ): Promise<PaginatedResult<CreativePatternDocument>> {
    const where = scopedWhere(filters.organizationId, {
      AND: [
        ...this.buildDataFilters(filters),
        this.buildNotExpiredFilter(new Date()),
      ],
      ...(filters.brandId ? { brandId: filters.brandId } : {}),
    });

    const [records, totalDocs] = await Promise.all([
      this.prisma.creativePattern.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        where,
      }),
      this.prisma.creativePattern.count({ where }),
    ]);

    return buildPaginatedResult(
      records.map((record) => this.normalizeRecord(record)),
      totalDocs,
      page,
      limit,
    );
  }

  /**
   * Top patterns by `avgPerformanceScore`. This is a ranking, not a list: the
   * score is only in the `data` JSON, so it ranks the freshest
   * {@link PATTERN_CANDIDATE_LIMIT} rows in memory and is not paginated.
   */
  async findRanked(
    filters: CreativePatternRankedFilters,
  ): Promise<CreativePatternDocument[]> {
    const now = new Date();
    const dataFilters = this.buildDataFilters(filters);
    const patterns = await this.prisma.creativePattern.findMany({
      orderBy: { updatedAt: 'desc' },
      take: PATTERN_CANDIDATE_LIMIT,
      where: scopedWhere(filters.organizationId, {
        ...(dataFilters.length > 0 ? { AND: dataFilters } : {}),
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
      }),
    });

    return patterns
      .map((record) => this.normalizeRecord(record))
      .filter((record) => {
        const validUntil = this.readDate(record.validUntil);
        return !validUntil || validUntil >= now;
      })
      .sort((a, b) => {
        const aScore = this.readNumber(a.avgPerformanceScore) ?? 0;
        const bScore = this.readNumber(b.avgPerformanceScore) ?? 0;
        return bScore - aScore;
      })
      .slice(
        0,
        Math.min(
          filters.limit ?? DEFAULT_RANKED_PATTERN_LIMIT,
          DEFAULT_RANKED_PATTERN_LIMIT,
        ),
      );
  }
}
