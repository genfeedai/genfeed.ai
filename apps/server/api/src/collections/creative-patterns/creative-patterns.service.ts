import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { PatternType } from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CreativePatternsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertPattern(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.creativePattern.findFirst({
      where: {
        brandId: (data.brand as string) ?? null,
        industry: (data.industry as string) ?? null,
        organizationId: (data.organization as string) ?? null,
        patternType: data.patternType as string,
        platform: (data.platform as string) ?? null,
        scope: data.scope as string,
      },
    });

    if (existing) {
      return this.prisma.creativePattern.update({
        data,
        where: { id: existing.id },
      });
    }

    return this.prisma.creativePattern.create({ data });
  }

  async findTopForBrand(
    orgId: string,
    _brandId: string,
    options?: { limit?: number; patternTypes?: PatternType[] },
  ): Promise<Record<string, unknown>[]> {
    const limit = options?.limit ?? 10;
    const now = new Date();

    return this.prisma.creativePattern.findMany({
      orderBy: { avgPerformanceScore: 'desc' },
      take: limit,
      where: {
        AND: [
          ...(options?.patternTypes?.length
            ? [{ patternType: { in: options.patternTypes as string[] } }]
            : []),
        ],
        OR: [
          {
            isDeleted: false,
            scope: 'public',
            validUntil: { gte: now },
          },
          {
            isDeleted: false,
            organizationId: orgId,
            scope: 'private',
            validUntil: { gte: now },
          },
        ],
      },
    });
  }

  async findAll(filters: {
    platform?: string;
    patternType?: PatternType;
    scope?: string;
  }): Promise<Record<string, unknown>[]> {
    return this.prisma.creativePattern.findMany({
      orderBy: { avgPerformanceScore: 'desc' },
      where: {
        isDeleted: false,
        validUntil: { gte: new Date() },
        ...(filters.platform ? { platform: filters.platform } : {}),
        ...(filters.patternType
          ? { patternType: filters.patternType as string }
          : {}),
        ...(filters.scope ? { scope: filters.scope } : {}),
      },
    });
  }
}
