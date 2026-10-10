import { mapPostCategoryToContentType } from '@api/collections/content-performance/utils/content-performance-category.util';
import { OutlierConfigurationService } from '@api/collections/outliers/services/outlier-configuration.service';
import { normalizeOutlierContentType } from '@api/collections/outliers/services/outlier-inputs.service';
import { latestWinnerAnalyticsIds } from '@api/collections/outliers/services/winner-latest-analytics.query';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  fromPrismaCredentialPlatform,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  IWinnerPost,
  OutlierConfigurationValues,
  WinnerClassificationPostInput,
  WinnerPostsQuery,
} from '@genfeedai/contracts/interfaces';
import { classifyWinners } from '@genfeedai/helpers';
import { Injectable } from '@nestjs/common';

/** Posts read per request, newest analytics first; each keeps only its latest row. */
const MAX_ANALYTICS_ROWS = 5_000;
const DEFAULT_LIMIT = 50;

interface WinnerCandidate {
  input: WinnerClassificationPostInput;
  post: Omit<IWinnerPost, 'evidence'>;
}

function isUnavailable(availability: unknown, key: string): boolean {
  return (
    !!availability &&
    typeof availability === 'object' &&
    (availability as Record<string, unknown>)[key] === 'unavailable'
  );
}

function isObserved(availability: unknown, key: string): boolean {
  return (
    !!availability &&
    typeof availability === 'object' &&
    (availability as Record<string, unknown>)[key] === 'observed'
  );
}

/**
 * #5502 one winner classification for own posts: any signal beating the
 * account × platform × content-type baseline (`classifyWinners`). Analytics
 * Posts reads its Winners filter from here.
 */
@Injectable()
export class WinnerClassificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuration: OutlierConfigurationService,
  ) {}

  async findWinners(
    query: WinnerPostsQuery,
    now: Date = new Date(),
  ): Promise<IWinnerPost[]> {
    const { organizationId } = query;
    const config = await this.configuration.resolve(organizationId);
    const candidates = await this.readCandidates(query);
    const buckets = new Map<string, WinnerCandidate[]>();
    for (const candidate of candidates) {
      const { accountId, platform, contentType } = candidate.input;
      const key = `${accountId}\u0000${platform}\u0000${contentType}`;
      buckets.set(key, [...(buckets.get(key) ?? []), candidate]);
    }

    const winners: IWinnerPost[] = [];
    for (const bucket of buckets.values()) {
      const first = bucket[0].input;
      const result = classifyWinners({
        nowMs: now.getTime(),
        options: this.options(config, first.platform),
        posts: bucket.map((candidate) => candidate.input),
        scope: {
          accountId: first.accountId,
          contentType: first.contentType,
          organizationId,
          platform: first.platform,
        },
      });
      for (const [index, entry] of result.posts.entries()) {
        const candidate = bucket[index];
        if (!entry.isWinner || !candidate) continue;
        if (!this.isPublishedInWindow(candidate.post.publishedAt, query)) {
          continue;
        }
        winners.push({ ...candidate.post, evidence: entry.evidence });
      }
    }

    return winners
      .sort(
        (left, right) =>
          (right.evidence[0]?.ratio ?? 0) - (left.evidence[0]?.ratio ?? 0) ||
          left.postId.localeCompare(right.postId) ||
          left.platform.localeCompare(right.platform),
      )
      .slice(0, Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), 100));
  }

  private options(config: OutlierConfigurationValues, platform: string) {
    return {
      breakoutThreshold: config.breakoutThreshold,
      maturityMs:
        (config.maturityHoursByPlatform[
          platform as keyof typeof config.maturityHoursByPlatform
        ] ?? 48) * 3_600_000,
      minimumSampleSize: config.minimumSampleSize,
      outlierThreshold: config.outlierThreshold,
      windowSize: config.windowSize,
    };
  }

  private isPublishedInWindow(
    publishedAt: string | null,
    { publishedFrom, publishedTo }: WinnerPostsQuery,
  ): boolean {
    if (!publishedFrom && !publishedTo) return true;
    if (!publishedAt) return false;
    const time = Date.parse(publishedAt);
    return (
      (!publishedFrom || time >= publishedFrom.getTime()) &&
      (!publishedTo || time <= publishedTo.getTime())
    );
  }

  /** The latest analytics row per own post and platform, newest first. */
  private async readCandidates(
    query: WinnerPostsQuery,
  ): Promise<WinnerCandidate[]> {
    const { organizationId, brandId } = query;
    const platform = query.platform
      ? toPrismaCredentialPlatform(query.platform)
      : undefined;
    // An unknown platform names nothing; it must not widen to every platform.
    if (query.platform && !platform) return [];
    const latest = await this.prisma.$queryRaw<Array<{ id: string }>>(
      latestWinnerAnalyticsIds({
        brandId,
        limit: MAX_ANALYTICS_ROWS,
        organizationId,
        platform,
      }),
    );
    if (!latest.length) return [];
    const rows = await this.prisma.postAnalytics.findMany({
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: {
        credentialId: true,
        engagementRate: true,
        isPinned: true,
        isPromoted: true,
        metricAvailability: true,
        platform: true,
        post: {
          select: {
            brand: { select: { label: true } },
            brandId: true,
            category: true,
            credentialId: true,
            description: true,
            id: true,
            isDeleted: true,
            label: true,
            publicationDate: true,
            publishedAt: true,
          },
        },
        totalComments: true,
        totalLikes: true,
        totalViews: true,
      },
      where: scopedWhere(organizationId, {
        ...(brandId ? { brandId } : {}),
        id: { in: latest.map((row) => row.id) },
        isDeleted: false,
        organizationId,
        ...(platform ? { platform } : {}),
      }),
    });

    const seen = new Set<string>();
    const candidates: WinnerCandidate[] = [];
    for (const row of rows) {
      const platformId = fromPrismaCredentialPlatform(row.platform);
      if (!platformId) continue;
      const key = `${row.post.id}\u0000${platformId}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const availability = row.metricAvailability;
      const views = isObserved(availability, 'views') ? row.totalViews : null;
      const publishedAt = row.post.publishedAt ?? row.post.publicationDate;
      const contentType = normalizeOutlierContentType(
        mapPostCategoryToContentType(row.post.category),
      );
      const metrics = {
        comments: isUnavailable(availability, 'comments')
          ? null
          : row.totalComments,
        // A rate without observed views would rest on an invented denominator.
        engagementRate: views !== null && views > 0 ? row.engagementRate : null,
        likes: isUnavailable(availability, 'likes') ? null : row.totalLikes,
        views,
      };
      candidates.push({
        input: {
          accountId:
            row.credentialId ?? row.post.credentialId ?? 'unattributed',
          contentType,
          id: key,
          isDeleted: row.post.isDeleted,
          isPinned: row.isPinned,
          isPromoted: row.isPromoted,
          metrics,
          organizationId,
          platform: platformId,
          publishedAtMs: publishedAt?.getTime() ?? Number.NaN,
        },
        post: {
          brandId: row.post.brandId,
          brandName: row.post.brand?.label ?? null,
          contentType,
          description: row.post.description ?? null,
          engagementRate: metrics.engagementRate,
          label: row.post.label ?? null,
          platform: platformId,
          postId: row.post.id,
          publishedAt: publishedAt?.toISOString() ?? null,
          totalComments: metrics.comments,
          totalLikes: metrics.likes,
          totalViews: metrics.views,
        },
      });
    }
    return candidates;
  }
}
