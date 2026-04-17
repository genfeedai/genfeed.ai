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

  async upsert(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const key = this.buildUpsertKey(data);
    const existing = await this.prisma.adPerformance.findFirst({
      where: key as never,
    });

    if (existing) {
      return this.prisma.adPerformance.update({
        data: data as never,
        where: { id: existing.id },
      });
    }

    return this.prisma.adPerformance.create({ data: data as never });
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
  ): Promise<Record<string, unknown>[]> {
    return this.prisma.adPerformance.findMany({
      orderBy: { date: 'desc' },
      skip: params.offset ?? 0,
      take: params.limit ?? 50,
      where: {
        isDeleted: false,
        organizationId,
        ...(params.adPlatform ? { adPlatform: params.adPlatform } : {}),
        ...(params.granularity ? { granularity: params.granularity } : {}),
        ...(params.startDate || params.endDate
          ? {
              date: {
                ...(params.startDate ? { gte: params.startDate } : {}),
                ...(params.endDate ? { lte: params.endDate } : {}),
              },
            }
          : {}),
      },
    });
  }

  async findTopPerformers(params: {
    adPlatform?: string;
    industry?: string;
    scope?: string;
    metric?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const sortField = (params.metric ??
      'performanceScore') as 'performanceScore';
    return this.prisma.adPerformance.findMany({
      orderBy: { [sortField]: 'desc' },
      take: params.limit ?? 10,
      where: {
        isDeleted: false,
        scope: params.scope ?? 'public',
        ...(params.adPlatform ? { adPlatform: params.adPlatform } : {}),
        ...(params.industry ? { industry: params.industry } : {}),
      },
    });
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    return this.prisma.adPerformance.findFirst({
      where: { id, isDeleted: false },
    });
  }

  async findLatestSyncDateForCredential(
    credentialId: string,
  ): Promise<Date | null> {
    const latestRecord = await this.prisma.adPerformance.findFirst({
      orderBy: { date: 'desc' },
      select: { date: true },
      where: { credentialId, isDeleted: false },
    });

    return latestRecord?.date ?? null;
  }

  async removeOrgFromAggregation(organizationId: string): Promise<number> {
    const result = await this.prisma.adPerformance.updateMany({
      data: { scope: 'organization' },
      where: { organizationId },
    });
    return result.count;
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
