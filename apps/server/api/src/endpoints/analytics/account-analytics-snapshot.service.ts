import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { AnalyticsMetricAvailability } from '@genfeedai/contracts';
import type { CredentialPlatform } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AccountAnalyticsSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertDailySnapshot(input: {
    brandId: string;
    credentialId: string;
    followers?: number | null;
    organizationId: string;
    platform: CredentialPlatform;
    subscribers?: number | null;
  }): Promise<void> {
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    const metricAvailability = {
      followers:
        typeof input.followers === 'number'
          ? AnalyticsMetricAvailability.OBSERVED
          : AnalyticsMetricAvailability.UNAVAILABLE,
      subscribers:
        typeof input.subscribers === 'number'
          ? AnalyticsMetricAvailability.OBSERVED
          : AnalyticsMetricAvailability.UNAVAILABLE,
    };

    await this.prisma.accountAnalyticsSnapshot.upsert({
      create: {
        brandId: input.brandId,
        credentialId: input.credentialId,
        date,
        followers: input.followers ?? null,
        metricAvailability,
        organizationId: input.organizationId,
        platform: input.platform,
        subscribers: input.subscribers ?? null,
      },
      update: {
        followers: input.followers ?? null,
        metricAvailability,
        subscribers: input.subscribers ?? null,
      },
      where: {
        credentialId_date: {
          credentialId: input.credentialId,
          date,
        },
      },
    });
  }

  async findLatest(
    organizationId: string,
    credentialId: string,
  ): Promise<{ date: Date; followers: number | null } | null> {
    return this.prisma.accountAnalyticsSnapshot.findFirst({
      select: { date: true, followers: true },
      where: scopedWhere(organizationId, { credentialId }),
      orderBy: { date: 'desc' },
    });
  }
}
