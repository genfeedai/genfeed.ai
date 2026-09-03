import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AnalyticsMetricAvailability,
  type CredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export function extractProfileCounts(value: unknown): {
  followers?: number;
  subscribers?: number;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const followers = asFiniteNumber(
    record.followers ?? record.followerCount ?? record.followersCount,
  );
  const subscribers = asFiniteNumber(
    record.subscribers ?? record.subscriberCount,
  );
  return {
    ...(followers === undefined ? {} : { followers }),
    ...(subscribers === undefined ? {} : { subscribers }),
  };
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

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
    const platform = toPrismaCredentialPlatform(input.platform);
    if (!platform) {
      return;
    }

    const date = startOfLocalDay(new Date());
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

    const existing = await this.prisma.accountAnalyticsSnapshot.findFirst({
      where: scopedWhere(input.organizationId, {
        credentialId: input.credentialId,
        date,
      }),
    });
    if (existing) {
      await this.prisma.accountAnalyticsSnapshot.updateMany({
        data: {
          ...(input.followers === undefined
            ? {}
            : { followers: input.followers }),
          metricAvailability,
          ...(input.subscribers === undefined
            ? {}
            : { subscribers: input.subscribers }),
        },
        where: scopedWhere(input.organizationId, { id: existing.id }),
      });
      return;
    }

    await this.prisma.accountAnalyticsSnapshot.create({
      data: {
        brandId: input.brandId,
        credentialId: input.credentialId,
        date,
        followers: input.followers ?? null,
        metricAvailability,
        organizationId: input.organizationId,
        platform,
        subscribers: input.subscribers ?? null,
      },
    });
  }

  async findLatest(
    organizationId: string,
    credentialId: string,
  ): Promise<{
    date: Date;
    followers: number | null;
    subscribers: number | null;
  } | null> {
    return this.prisma.accountAnalyticsSnapshot.findFirst({
      select: { date: true, followers: true, subscribers: true },
      where: scopedWhere(organizationId, { credentialId }),
      orderBy: { date: 'desc' },
    });
  }
}
