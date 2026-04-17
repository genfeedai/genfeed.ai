import type { InsightType } from '@api/collections/ad-insights/schemas/ad-insights.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AdInsightsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async upsertInsight(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.prisma.adInsight.upsert({
      create: data as never,
      update: data as never,
      where: {
        adPlatform_industry_insightType: {
          adPlatform: (data.adPlatform as string) ?? '',
          industry: (data.industry as string) ?? '',
          insightType: data.insightType as string,
        },
      },
    });
  }

  async getInsight(
    insightType: InsightType,
    params?: { adPlatform?: string; industry?: string },
  ): Promise<Record<string, unknown> | null> {
    return this.prisma.adInsight.findFirst({
      orderBy: { computedAt: 'desc' },
      where: {
        insightType,
        isDeleted: false,
        validUntil: { gte: new Date() },
        ...(params?.adPlatform ? { adPlatform: params.adPlatform } : {}),
        ...(params?.industry ? { industry: params.industry } : {}),
      },
    });
  }

  async getInsightsByType(
    insightType: InsightType,
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adInsight.findMany({
      orderBy: { computedAt: 'desc' },
      where: {
        insightType,
        isDeleted: false,
        validUntil: { gte: new Date() },
      },
    });
  }

  async removeExpired(): Promise<number> {
    const result = await this.prisma.adInsight.deleteMany({
      where: {
        validUntil: { lt: new Date() },
      },
    });
    return result.count;
  }
}
