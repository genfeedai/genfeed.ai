import type {
  CreativePattern,
  CreativePatternDocument,
} from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PatternType } from '@genfeedai/interfaces';
import { type Prisma, toPrismaJson } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

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
    const limit = options?.limit ?? 10;
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

  async findAll(filters: {
    organizationId: string;
    brandId?: string;
    limit?: number;
    patternType?: PatternType;
    platform?: string;
    scope?: string;
    top?: boolean;
  }): Promise<CreativePatternDocument[]> {
    const now = new Date();
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
    } else if (filters.top) {
      dataFilters.push({
        OR: [
          { data: { equals: 'public', path: ['scope'] } },
          { data: { equals: 'private', path: ['scope'] } },
        ],
      });
    }
    const patterns = await this.prisma.creativePattern.findMany({
      where: scopedWhere(filters.organizationId, {
        ...(dataFilters.length > 0 ? { AND: dataFilters } : {}),
        ...(filters.brandId ? { brandId: filters.brandId } : {}),
      }),
    });

    const filtered = patterns
      .map((record) => this.normalizeRecord(record))
      .filter((record) => {
        const validUntil = this.readDate(record.validUntil);
        if (validUntil && validUntil < now) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aScore = this.readNumber(a.avgPerformanceScore) ?? 0;
        const bScore = this.readNumber(b.avgPerformanceScore) ?? 0;
        return bScore - aScore;
      });

    if (filters.top) {
      return filtered.slice(0, filters.limit ?? 10);
    }

    return filtered;
  }
}
