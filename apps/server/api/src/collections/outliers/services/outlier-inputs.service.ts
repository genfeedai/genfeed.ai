import { mapPostCategoryToContentType } from '@api/collections/content-performance/utils/content-performance-category.util';
import { latestOutlierAnalyticsIds } from '@api/collections/outliers/services/outlier-latest-analytics.query';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  fromPrismaCredentialPlatform,
  SocialSourceType,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  OutlierAccountScope,
  OutlierObservation,
  OutlierResolvedAccount,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

export function normalizeOutlierContentType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (['tweet', 'text', 'post', 'caption'].includes(normalized))
    return 'caption';
  if (['reel', 'short', 'video'].includes(normalized)) return 'video';
  if (['image', 'photo', 'story'].includes(normalized)) return 'image';
  return normalized || 'caption';
}
export function readOutlierFlag(
  value: unknown,
  keys: string[],
): boolean | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of keys)
    if (typeof record[key] === 'boolean') return record[key];
  return null;
}
export function readOutlierViews(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const views = (value as Record<string, unknown>).views;
  return typeof views === 'number' ? views : null;
}

@Injectable()
export class OutlierInputsService {
  constructor(private readonly prisma: PrismaService) {}
  async authorize(scope: OutlierAccountScope): Promise<OutlierResolvedAccount> {
    const { organizationId, brandId, accountId } = scope;
    const brand = await this.prisma.brand.findFirst({
      select: { id: true },
      where: { id: brandId, organizationId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Outlier account');
    if (scope.accountType === 'credential') {
      const credential = await this.prisma.credential.findFirst({
        select: { platform: true },
        where: { id: accountId, organizationId, brandId, isDeleted: false },
      });
      const platform =
        credential && fromPrismaCredentialPlatform(credential.platform);
      if (!platform) throw new NotFoundException('Outlier account');
      return {
        organizationId,
        brandId,
        accountId,
        accountType: scope.accountType,
        platform,
      };
    }
    const source = await this.prisma.socialSource.findFirst({
      select: { platform: true, sourceType: true, credentialId: true },
      where: scopedWhere(organizationId, {
        id: accountId,
        organizationId,
        brandId,
        isDeleted: false,
      }),
    });
    if (
      !source ||
      ![SocialSourceType.ACCOUNT, SocialSourceType.OWN_ACCOUNT].includes(
        source.sourceType as SocialSourceType,
      )
    )
      throw new NotFoundException('Outlier account');
    if (source.sourceType === SocialSourceType.OWN_ACCOUNT) {
      if (!source.credentialId) throw new NotFoundException('Outlier account');
      const resolved = await this.authorize({
        ...scope,
        accountType: 'credential',
        accountId: source.credentialId,
      });
      if (resolved.platform !== source.platform)
        throw new NotFoundException('Outlier account');
      return resolved;
    }
    return {
      organizationId,
      brandId,
      accountId,
      accountType: scope.accountType,
      platform: source.platform,
    };
  }
  async read(scope: OutlierResolvedAccount): Promise<OutlierObservation[]> {
    const { organizationId, brandId, platform } = scope;
    const scopeWhere = { organizationId, brandId, isDeleted: false };
    let recordCount = 0;
    const observations: OutlierObservation[] = [];
    const sources = await this.prisma.socialSource.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        ...scopeWhere,
        platform,
        ...(scope.accountType === 'credential'
          ? {
              sourceType: SocialSourceType.OWN_ACCOUNT,
              credentialId: scope.accountId,
            }
          : { id: scope.accountId, sourceType: SocialSourceType.ACCOUNT }),
      }),
      take: 10001,
      orderBy: { id: 'asc' },
    });
    if (sources.length > 10000)
      throw new Error('Outlier history exceeds the 10000-record safety limit');
    for (let skip = 0; ; skip += 200) {
      const rows = await this.prisma.sourcePost.findMany({
        where: {
          ...scopeWhere,
          platform,
          sourceId: { in: sources.map((source) => source.id) },
        },
        select: {
          id: true,
          sourceId: true,
          externalId: true,
          contentType: true,
          publishedAt: true,
          metrics: true,
          raw: true,
          collectedAt: true,
          updatedAt: true,
        },
        orderBy: { id: 'asc' },
        skip,
        take: 200,
      });
      recordCount += rows.length;
      if (recordCount > 10000)
        throw new Error(
          'Outlier history exceeds the 10000-record safety limit',
        );
      for (const row of rows)
        observations.push({
          ...scope,
          id: `${platform}:${row.externalId}`,
          contentType: normalizeOutlierContentType(row.contentType),
          publishedAtMs: row.publishedAt?.getTime() ?? NaN,
          views: readOutlierViews(row.metrics),
          isDeleted: false,
          isPinned: readOutlierFlag(row.raw, [
            'isPinned',
            'is_pinned',
            'pinned',
          ]),
          isPromoted: readOutlierFlag(row.raw, [
            'isPromoted',
            'is_promoted',
            'promoted',
            'isSponsored',
            'is_sponsored',
          ]),
          postId: null,
          sourcePostId: row.id,
          measuredAt: row.updatedAt,
          sourceIdentity: `source:${row.sourceId}:${row.id}`,
        });
      if (rows.length < 200) break;
    }
    if (scope.accountType === 'credential')
      observations.push(...(await this.readAnalytics(scope, recordCount)));
    return this.selectLatest(observations);
  }
  private async readAnalytics(
    scope: OutlierResolvedAccount,
    recordCount: number,
  ): Promise<OutlierObservation[]> {
    const { organizationId, brandId, platform } = scope;
    const scopeWhere = { organizationId, brandId, isDeleted: false };
    const observations: OutlierObservation[] = [];
    const prismaPlatform = toPrismaCredentialPlatform(platform);
    if (!prismaPlatform) throw new NotFoundException('Outlier account');
    for (let skip = 0; ; skip += 200) {
      const latest = await this.prisma.$queryRaw<Array<{ id: string }>>(
        latestOutlierAnalyticsIds(scope, prismaPlatform, skip),
      );
      if (!latest.length) break;
      const rows = await this.prisma.postAnalytics.findMany({
        where: scopedWhere(scope.organizationId, {
          ...scopeWhere,
          platform: prismaPlatform,
          id: { in: latest.map((row) => row.id) },
        }),
        select: {
          id: true,
          credentialId: true,
          totalViews: true,
          metricAvailability: true,
          isPinned: true,
          isPromoted: true,
          updatedAt: true,
          post: {
            select: {
              id: true,
              credentialId: true,
              externalId: true,
              category: true,
              publishedAt: true,
              publicationDate: true,
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 200,
      });
      recordCount += rows.length;
      if (recordCount > 10000)
        throw new Error(
          'Outlier history exceeds the 10000-record safety limit',
        );
      for (const row of rows) {
        if (
          row.credentialId &&
          row.post.credentialId &&
          row.credentialId !== row.post.credentialId
        )
          throw new Error(
            'Outlier analytics credential attribution disagrees with post',
          );
        const availability = row.metricAvailability as Record<string, unknown>;
        observations.push({
          ...scope,
          id: row.post.externalId
            ? `${platform}:${row.post.externalId}`
            : `post:${row.post.id}`,
          contentType: normalizeOutlierContentType(
            mapPostCategoryToContentType(row.post.category),
          ),
          publishedAtMs:
            (row.post.publishedAt ?? row.post.publicationDate)?.getTime() ??
            NaN,
          views: availability.views === 'observed' ? row.totalViews : null,
          isDeleted: false,
          isPinned: row.isPinned,
          isPromoted: row.isPromoted,
          postId: row.post.id,
          sourcePostId: null,
          measuredAt: row.updatedAt,
          sourceIdentity: `analytics:${row.id}`,
        });
      }
      if (latest.length < 200) break;
    }
    return observations;
  }
  private selectLatest(
    observations: OutlierObservation[],
  ): OutlierObservation[] {
    const selected = new Map<string, OutlierObservation>();
    for (const observation of observations) {
      const previous = selected.get(observation.id);
      if (
        !previous ||
        observation.measuredAt.getTime() > previous.measuredAt.getTime() ||
        (observation.measuredAt.getTime() === previous.measuredAt.getTime() &&
          (Boolean(observation.postId) > Boolean(previous.postId) ||
            (Boolean(observation.postId) === Boolean(previous.postId) &&
              observation.sourceIdentity < previous.sourceIdentity)))
      )
        selected.set(observation.id, observation);
    }
    return [...selected.values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
  }
}
