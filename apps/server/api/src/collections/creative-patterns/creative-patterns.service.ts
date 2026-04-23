import type {
  CreativePattern,
  CreativePatternDocument,
} from '@api/collections/creative-patterns/schemas/creative-pattern.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PatternType } from '@genfeedai/interfaces';
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
      _id: record.mongoId ?? record.id,
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
    const organizationId =
      this.readString(data.organizationId) ??
      this.readString(data.organization);

    if (!organizationId) {
      throw new Error('CreativePattern organizationId is required');
    }

    return {
      brandId:
        this.readString(data.brandId) ?? this.readString(data.brand) ?? null,
      data: normalizedData,
      organizationId,
    };
  }

  async upsertPattern(
    data: Record<string, unknown>,
  ): Promise<CreativePatternDocument> {
    const payload = this.toPersistencePayload(data);
    const existing = (
      await this.prisma.creativePattern.findMany({
        where: {
          isDeleted: false,
          organizationId: payload.organizationId,
        },
      })
    )
      .map((record) => this.normalizeRecord(record))
      .find(
        (record) =>
          (this.readString(record.brand) ?? null) === payload.brandId &&
          this.readString(record.industry) === this.readString(data.industry) &&
          this.readString(record.patternType) ===
            this.readString(data.patternType) &&
          this.readString(record.platform) === this.readString(data.platform) &&
          this.readString(record.scope) === this.readString(data.scope),
      );

    if (existing) {
      const updated = await this.prisma.creativePattern.update({
        data: {
          brandId: payload.brandId,
          data: payload.data as never,
          organizationId: payload.organizationId,
        },
        where: { id: existing.id },
      });

      return this.normalizeRecord(updated);
    }

    const created = await this.prisma.creativePattern.create({
      data: {
        brandId: payload.brandId,
        data: payload.data as never,
        organizationId: payload.organizationId,
      },
    });

    return this.normalizeRecord(created);
  }

  async findTopForBrand(
    orgId: string,
    _brandId: string,
    options?: { limit?: number; patternTypes?: PatternType[] },
  ): Promise<CreativePatternDocument[]> {
    const limit = options?.limit ?? 10;
    const now = new Date();
    const patterns = await this.prisma.creativePattern.findMany({
      where: {
        isDeleted: false,
        organizationId: orgId,
      },
    });

    return patterns
      .map((record) => this.normalizeRecord(record))
      .filter((record) => {
        if (
          options?.patternTypes?.length &&
          !options.patternTypes.includes(record.patternType as PatternType)
        ) {
          return false;
        }

        const validUntil = this.readDate(record.validUntil);
        if (validUntil && validUntil < now) {
          return false;
        }

        const scope = this.readString(record.scope);
        return scope === 'public' || scope === 'private';
      })
      .sort((a, b) => {
        const aScore = this.readNumber(a.avgPerformanceScore) ?? 0;
        const bScore = this.readNumber(b.avgPerformanceScore) ?? 0;
        return bScore - aScore;
      })
      .slice(0, limit);
  }

  async findAll(filters: {
    platform?: string;
    patternType?: PatternType;
    scope?: string;
  }): Promise<CreativePatternDocument[]> {
    const now = new Date();
    const patterns = await this.prisma.creativePattern.findMany({
      where: {
        isDeleted: false,
      },
    });

    return patterns
      .map((record) => this.normalizeRecord(record))
      .filter((record) => {
        const validUntil = this.readDate(record.validUntil);
        if (validUntil && validUntil < now) {
          return false;
        }

        if (
          filters.platform &&
          this.readString(record.platform) !== filters.platform
        ) {
          return false;
        }

        if (
          filters.patternType &&
          this.readString(record.patternType) !== filters.patternType
        ) {
          return false;
        }

        if (filters.scope && this.readString(record.scope) !== filters.scope) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        const aScore = this.readNumber(a.avgPerformanceScore) ?? 0;
        const bScore = this.readNumber(b.avgPerformanceScore) ?? 0;
        return bScore - aScore;
      });
  }
}
