import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type InsightType = string;

type AdInsightPayload = Record<string, unknown> & {
  adPlatform?: string;
  industry?: string;
  insightType?: string;
  validUntil?: Date | string;
};

@Injectable()
export class AdInsightsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  private asPayload(data: unknown): AdInsightPayload {
    return (data as AdInsightPayload | null) ?? {};
  }

  private readValidUntil(data: unknown): Date | null {
    const value = this.asPayload(data).validUntil;
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  }

  private matchesInsight(
    payload: AdInsightPayload,
    insightType: InsightType,
    params?: { adPlatform?: string; industry?: string },
  ): boolean {
    if (payload.insightType !== insightType) {
      return false;
    }

    if (params?.adPlatform && payload.adPlatform !== params.adPlatform) {
      return false;
    }

    if (params?.industry && payload.industry !== params.industry) {
      return false;
    }

    const validUntil = this.readValidUntil(payload);
    if (validUntil && validUntil < new Date()) {
      return false;
    }

    return true;
  }

  async upsertInsight(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const payload = this.asPayload(data);
    const existing = await this.getInsight(payload.insightType ?? '', {
      adPlatform: payload.adPlatform,
      industry: payload.industry,
    });
    const existingId =
      typeof existing?.id === 'string' ? existing.id : undefined;

    if (existingId) {
      return this.prisma.adInsights.update({
        data: { data: payload as never },
        where: { id: existingId },
      }) as unknown as Record<string, unknown>;
    }

    return this.prisma.adInsights.create({
      data: {
        data: payload as never,
        isDeleted: false,
      },
    }) as unknown as Record<string, unknown>;
  }

  async getInsight(
    insightType: InsightType,
    params?: { adPlatform?: string; industry?: string },
  ): Promise<Record<string, unknown> | null> {
    const entries = await this.prisma.adInsights.findMany({
      orderBy: { createdAt: 'desc' },
      where: { isDeleted: false },
    });

    const match = entries.find((entry) =>
      this.matchesInsight(this.asPayload(entry.data), insightType, params),
    );

    return (match as Record<string, unknown> | undefined) ?? null;
  }

  async getInsightsByType(
    insightType: InsightType,
  ): Promise<Record<string, unknown>[]> {
    const entries = await this.prisma.adInsights.findMany({
      orderBy: { createdAt: 'desc' },
      where: { isDeleted: false },
    });

    return entries.filter((entry) =>
      this.matchesInsight(this.asPayload(entry.data), insightType),
    ) as unknown as Record<string, unknown>[];
  }

  async removeExpired(): Promise<number> {
    const entries = await this.prisma.adInsights.findMany({
      where: { isDeleted: false },
    });
    const expiredIds = entries
      .filter((entry) => {
        const validUntil = this.readValidUntil(entry.data);
        return validUntil !== null && validUntil < new Date();
      })
      .map((entry) => entry.id);

    const result =
      expiredIds.length > 0
        ? await this.prisma.adInsights.deleteMany({
            where: { id: { in: expiredIds } },
          })
        : { count: 0 };

    return result.count;
  }
}
