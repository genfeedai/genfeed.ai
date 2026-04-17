import type {
  TrendSourceAccountResult,
  TrendSourceAccountSummary,
  TrendSourceItem,
  TrendSourceReferenceRecord,
  TrendSourceReferenceResult,
} from '@api/collections/trends/interfaces/trend.interfaces';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

interface SyncTrendInput {
  id: string;
  topic: string;
  platform: string;
  mentions: number;
  viralityScore: number;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  sourcePreview: TrendSourceItem[];
}

interface RemixLineagePayload {
  organizationId: string;
  brandId: string;
  contentDraftId?: string;
  postId?: string;
  generatedBy: string;
  platforms: string[];
  draftType?: string;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

interface ReferenceQueryOptions {
  authorHandle?: string;
  limit?: number;
  platform?: string;
  trendId?: string;
}

interface ReferenceRecordData {
  authorHandle?: string;
  canonicalUrl: string;
  contentType: TrendSourceItem['contentType'];
  currentEngagementTotal: number;
  currentMetrics?: TrendSourceItem['metrics'];
  firstSeenAt: string;
  lastSeenAt: string;
  latestTrendMentions: number;
  latestTrendViralityScore: number;
  matchedTrendTopics: string[];
  mediaUrl?: string;
  platform: string;
  publishedAt?: string;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  text?: string;
  thumbnailUrl?: string;
  title?: string;
}

@Injectable()
export class TrendReferenceCorpusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async syncTrendReferences(
    trends: SyncTrendInput[],
  ): Promise<{ links: number; references: number; snapshots: number }> {
    let references = 0;
    let snapshots = 0;
    let links = 0;

    for (const trend of trends) {
      for (const sourceItem of trend.sourcePreview) {
        if (!sourceItem.sourceUrl) {
          continue;
        }

        const canonicalUrl = this.normalizeSourceUrl(sourceItem.sourceUrl);

        // Upsert the source reference
        const existingRef = await this.prisma.trendSourceReference.findFirst({
          where: {
            isDeleted: false,
            // match canonicalUrl + platform stored in data JSON — in-memory
          },
        });

        // In-memory approach since canonicalUrl/platform live in JSON `data`
        const allRefs = await this.prisma.trendSourceReference.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5000,
          where: { isDeleted: false },
        });
        void existingRef;

        const matchedRef = allRefs.find((doc) => {
          const d = doc.data as unknown as Record<string, unknown>;
          return (
            d.canonicalUrl === canonicalUrl &&
            d.platform === sourceItem.platform
          );
        });

        const engagementTotal = this.getEngagementTotal(sourceItem.metrics);
        const now = new Date();

        let referenceId: string;

        if (matchedRef) {
          const existingData =
            matchedRef.data as unknown as ReferenceRecordData;
          const matchedTopics = Array.isArray(existingData.matchedTrendTopics)
            ? existingData.matchedTrendTopics
            : [];
          const updatedTopics = matchedTopics.includes(trend.topic)
            ? matchedTopics
            : [...matchedTopics, trend.topic];

          await this.prisma.trendSourceReference.update({
            data: {
              data: {
                ...existingData,
                authorHandle: sourceItem.authorHandle,
                contentType: sourceItem.contentType,
                currentEngagementTotal: engagementTotal,
                currentMetrics: sourceItem.metrics || {},
                externalId: sourceItem.id,
                lastSeenAt: now.toISOString(),
                latestTrendMentions: trend.mentions,
                latestTrendViralityScore: trend.viralityScore,
                matchedTrendTopics: updatedTopics,
                mediaUrl: sourceItem.mediaUrl,
                publishedAt: sourceItem.publishedAt
                  ? new Date(sourceItem.publishedAt).toISOString()
                  : undefined,
                sourcePreviewState: trend.sourcePreviewState,
                text: sourceItem.text,
                thumbnailUrl: sourceItem.thumbnailUrl,
                title: sourceItem.title,
              } as never,
            },
            where: { id: matchedRef.id },
          });
          referenceId = matchedRef.id;
        } else {
          const created = await this.prisma.trendSourceReference.create({
            data: {
              data: {
                authorHandle: sourceItem.authorHandle,
                canonicalUrl,
                contentType: sourceItem.contentType,
                currentEngagementTotal: engagementTotal,
                currentMetrics: sourceItem.metrics || {},
                externalId: sourceItem.id,
                firstSeenAt: now.toISOString(),
                lastSeenAt: now.toISOString(),
                latestTrendMentions: trend.mentions,
                latestTrendViralityScore: trend.viralityScore,
                matchedTrendTopics: [trend.topic],
                mediaUrl: sourceItem.mediaUrl,
                platform: sourceItem.platform,
                publishedAt: sourceItem.publishedAt
                  ? new Date(sourceItem.publishedAt).toISOString()
                  : undefined,
                sourcePreviewState: trend.sourcePreviewState,
                text: sourceItem.text,
                thumbnailUrl: sourceItem.thumbnailUrl,
                title: sourceItem.title,
              } as never,
              isDeleted: false,
            },
          });
          referenceId = created.id;
        }
        references += 1;

        // Upsert snapshot for today
        const snapshotDate = this.toSnapshotDate();
        const existingSnapshot =
          await this.prisma.trendSourceReferenceSnapshot.findFirst({
            where: {
              isDeleted: false,
              sourceReferenceId: referenceId,
            },
          });

        // Find snapshot matching snapshotDate (stored in data)
        const snapshotDocs =
          await this.prisma.trendSourceReferenceSnapshot.findMany({
            where: {
              isDeleted: false,
              sourceReferenceId: referenceId,
            },
          });
        const matchedSnapshot = snapshotDocs.find((doc) => {
          const d = doc.data as unknown as Record<string, unknown>;
          return d.snapshotDate === snapshotDate.toISOString();
        });
        void existingSnapshot;

        if (!matchedSnapshot) {
          await this.prisma.trendSourceReferenceSnapshot.create({
            data: {
              data: {
                engagementTotal,
                metrics: sourceItem.metrics || {},
                snapshotDate: snapshotDate.toISOString(),
                trendMentions: trend.mentions,
                trendViralityScore: trend.viralityScore,
              } as never,
              isDeleted: false,
              sourceReferenceId: referenceId,
            },
          });
          snapshots += 1;
        } else {
          await this.prisma.trendSourceReferenceSnapshot.update({
            data: {
              data: {
                engagementTotal,
                metrics: sourceItem.metrics || {},
                snapshotDate: snapshotDate.toISOString(),
                trendMentions: trend.mentions,
                trendViralityScore: trend.viralityScore,
              } as never,
            },
            where: { id: matchedSnapshot.id },
          });
        }

        // Upsert link between trend and source reference
        const existingLink =
          await this.prisma.trendSourceReferenceLink.findFirst({
            where: {
              isDeleted: false,
              sourceReferenceId: referenceId,
              trendId: trend.id,
            },
          });

        if (!existingLink) {
          await this.prisma.trendSourceReferenceLink.create({
            data: {
              isDeleted: false,
              sourceReferenceId: referenceId,
              trendId: trend.id,
            },
          });
          links += 1;
        } else {
          // Update matchReason/rankAtCapture in a data-like field if needed
          // TrendSourceReferenceLink has no data blob — nothing to update
        }
      }
    }

    return { links, references, snapshots };
  }

  async countGlobalReferences(): Promise<number> {
    return this.prisma.trendSourceReference.count({
      where: { isDeleted: false },
    });
  }

  async recordDraftRemixLineage(payload: RemixLineagePayload): Promise<void> {
    const hasContentDraftId =
      typeof payload.contentDraftId === 'string' &&
      payload.contentDraftId.length > 0;
    const hasPostId =
      typeof payload.postId === 'string' && payload.postId.length > 0;

    if (!hasContentDraftId && !hasPostId) {
      return;
    }

    const sourceReferenceIds = await this.resolveSourceReferenceIds(
      payload.metadata,
    );
    const trendIds = [
      ...this.parseStringArray(payload.metadata?.trendIds),
      ...this.parseOptionalString(payload.metadata?.trendId),
    ];
    const sourceUrls = [
      ...this.parseStringArray(payload.metadata?.sourceUrls),
      ...this.parseOptionalString(payload.metadata?.sourceUrl),
    ];

    if (sourceReferenceIds.length === 0 && trendIds.length === 0) {
      return;
    }

    // Find existing lineage record
    const where = hasContentDraftId
      ? { contentDraftId: payload.contentDraftId }
      : { postId: payload.postId };

    const existing = await this.prisma.trendRemixLineage.findFirst({
      where: { ...where, isDeleted: false } as never,
    });

    const dataPayload = {
      draftType: payload.draftType,
      generatedBy: payload.generatedBy,
      platforms: payload.platforms,
      prompt: payload.prompt,
      sourceUrls,
    };

    if (existing) {
      await this.prisma.trendRemixLineage.update({
        data: {
          data: dataPayload as never,
          // Update relations via Prisma connect
          sourceReferences: {
            set: sourceReferenceIds.map((id) => ({ id })),
          },
          trends: {
            set: trendIds.map((id) => ({ id })),
          },
        } as never,
        where: { id: existing.id },
      });
    } else {
      await this.prisma.trendRemixLineage.create({
        data: {
          brandId: payload.brandId,
          contentDraftId: hasContentDraftId
            ? payload.contentDraftId
            : undefined,
          data: dataPayload as never,
          isDeleted: false,
          organizationId: payload.organizationId,
          postId: hasPostId ? payload.postId : undefined,
          sourceReferences: {
            connect: sourceReferenceIds.map((id) => ({ id })),
          },
          trends: {
            connect: trendIds.map((id) => ({ id })),
          },
        } as never,
      });
    }
  }

  async annotateSourceItemsWithReferenceIds<T extends TrendSourceItem>(
    items: T[],
  ): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }

    const sourceUrls = items
      .map((item) => item.sourceUrl)
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

    if (sourceUrls.length === 0) {
      return items;
    }

    const canonicalUrls = Array.from(
      new Set(
        sourceUrls.map((sourceUrl) => this.normalizeSourceUrl(sourceUrl)),
      ),
    );

    const allRefs = await this.prisma.trendSourceReference.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5000,
      where: { isDeleted: false },
    });

    const matchedRefs = allRefs.filter((doc) => {
      const d = doc.data as unknown as Record<string, unknown>;
      return canonicalUrls.includes(d.canonicalUrl as string);
    });

    if (matchedRefs.length === 0) {
      return items;
    }

    const referenceMap = new Map(
      matchedRefs.map((doc) => {
        const d = doc.data as unknown as Record<string, unknown>;
        return [d.canonicalUrl as string, doc.id];
      }),
    );

    return items.map((item) => ({
      ...item,
      sourceReferenceId:
        referenceMap.get(this.normalizeSourceUrl(item.sourceUrl)) ??
        item.sourceReferenceId,
    }));
  }

  async getReferenceCorpus(
    organizationId: string | undefined,
    brandId: string | undefined,
    options: ReferenceQueryOptions = {},
  ): Promise<TrendSourceReferenceResult> {
    const limit = options.limit ?? 30;

    let sourceReferenceIds: string[] | undefined;
    if (options.trendId) {
      const links = await this.prisma.trendSourceReferenceLink.findMany({
        where: {
          isDeleted: false,
          trendId: options.trendId,
        },
      });
      sourceReferenceIds = links
        .map((l) => l.sourceReferenceId)
        .filter((id): id is string => id != null);
    }

    const allRefs = await this.prisma.trendSourceReference.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit * 10,
      where: {
        ...(sourceReferenceIds != null
          ? { id: { in: sourceReferenceIds } }
          : {}),
        isDeleted: false,
      },
    });

    // In-memory filter on JSON data fields
    let docs = allRefs.filter((doc) => {
      const d = doc.data as unknown as Record<string, unknown>;
      if (options.platform && d.platform !== options.platform) return false;
      if (options.authorHandle && d.authorHandle !== options.authorHandle)
        return false;
      return true;
    });

    // Sort by engagement, lastSeenAt, viralityScore
    docs = docs
      .sort((a, b) => {
        const ad = a.data as unknown as Record<string, number>;
        const bd = b.data as unknown as Record<string, number>;
        const engDiff =
          (bd.currentEngagementTotal ?? 0) - (ad.currentEngagementTotal ?? 0);
        if (engDiff !== 0) return engDiff;
        const virDiff =
          (bd.latestTrendViralityScore ?? 0) -
          (ad.latestTrendViralityScore ?? 0);
        return virDiff;
      })
      .slice(0, limit);

    const remixCounts = await this.getRemixCounts(
      docs.map((doc) => doc.id),
      organizationId,
      brandId,
    );

    return {
      items: docs.map((doc) =>
        this.toReferenceRecord(
          doc.id,
          doc.data as unknown as ReferenceRecordData,
          doc.createdAt,
          remixCounts,
        ),
      ),
      totalReferences: docs.length,
    };
  }

  async getTopReferenceAccounts(
    organizationId?: string,
    brandId?: string,
    options: {
      limit?: number;
      platform?: string;
    } = {},
  ): Promise<TrendSourceAccountResult> {
    const limit = options.limit ?? 20;

    const allRefs = await this.prisma.trendSourceReference.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10000,
      where: { isDeleted: false },
    });

    // In-memory grouping by authorHandle + platform (data fields)
    type AccountKey = string; // `${platform}:${authorHandle}`
    const accountMap = new Map<
      AccountKey,
      {
        authorHandle: string;
        platform: string;
        referenceCount: number;
        totalEngagement: number;
        totalViralityScore: number;
        lastSeenAt?: Date;
      }
    >();

    for (const doc of allRefs) {
      const d = doc.data as unknown as Record<string, unknown>;
      const authorHandle = d.authorHandle as string | undefined;
      const platform = d.platform as string | undefined;
      if (!authorHandle || !platform) continue;
      if (options.platform && platform !== options.platform) continue;

      const key: AccountKey = `${platform}:${authorHandle}`;
      const existing = accountMap.get(key);
      const lastSeenAtStr = d.lastSeenAt as string | undefined;
      const lastSeenAt = lastSeenAtStr ? new Date(lastSeenAtStr) : undefined;

      if (existing) {
        existing.referenceCount += 1;
        existing.totalEngagement += (d.currentEngagementTotal as number) ?? 0;
        existing.totalViralityScore +=
          (d.latestTrendViralityScore as number) ?? 0;
        if (
          lastSeenAt &&
          (!existing.lastSeenAt || lastSeenAt > existing.lastSeenAt)
        ) {
          existing.lastSeenAt = lastSeenAt;
        }
      } else {
        accountMap.set(key, {
          authorHandle,
          lastSeenAt,
          platform,
          referenceCount: 1,
          totalEngagement: (d.currentEngagementTotal as number) ?? 0,
          totalViralityScore: (d.latestTrendViralityScore as number) ?? 0,
        });
      }
    }

    const brandRemixCounts = await this.getBrandRemixCountsByAccount(
      organizationId,
      brandId,
      options.platform,
    );

    const accounts: TrendSourceAccountSummary[] = Array.from(
      accountMap.entries(),
    )
      .map(([key, stats]) => ({
        authorHandle: stats.authorHandle,
        avgTrendViralityScore: Math.round(
          stats.referenceCount > 0
            ? stats.totalViralityScore / stats.referenceCount
            : 0,
        ),
        brandRemixCount: brandRemixCounts.get(key) || 0,
        lastSeenAt: stats.lastSeenAt?.toISOString(),
        platform: stats.platform,
        referenceCount: stats.referenceCount,
        totalEngagement: stats.totalEngagement,
      }))
      .sort(
        (a, b) =>
          b.avgTrendViralityScore - a.avgTrendViralityScore ||
          b.referenceCount - a.referenceCount ||
          b.totalEngagement - a.totalEngagement,
      )
      .slice(0, limit);

    return {
      accounts,
      totalAccounts: accounts.length,
    };
  }

  private async resolveSourceReferenceIds(
    metadata?: Record<string, unknown>,
  ): Promise<string[]> {
    const explicitIds = [
      ...this.parseStringArray(metadata?.sourceReferenceIds),
      ...this.parseOptionalString(metadata?.sourceReferenceId),
    ];
    if (explicitIds.length > 0) {
      return Array.from(new Set(explicitIds));
    }

    const sourceUrls = [
      ...this.parseStringArray(metadata?.sourceUrls),
      ...this.parseOptionalString(metadata?.sourceUrl),
    ];
    if (sourceUrls.length === 0) {
      return [];
    }

    const normalizedUrls = sourceUrls.map((url) =>
      this.normalizeSourceUrl(url),
    );

    const allRefs = await this.prisma.trendSourceReference.findMany({
      take: 5000,
      where: { isDeleted: false },
    });

    return allRefs
      .filter((doc) => {
        const d = doc.data as unknown as Record<string, unknown>;
        return normalizedUrls.includes(d.canonicalUrl as string);
      })
      .map((doc) => doc.id);
  }

  private parseOptionalString(value: unknown): string[] {
    if (typeof value !== 'string' || value.length === 0) {
      return [];
    }

    return [value];
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    );
  }

  private normalizeSourceUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString().replace(/\/$/, '');
    } catch (error) {
      this.loggerService.warn('Failed to normalize source URL', {
        error: error instanceof Error ? error.message : String(error),
        url,
      });
      return url.replace(/[?#].*$/, '').replace(/\/$/, '');
    }
  }

  private getEngagementTotal(metrics?: TrendSourceItem['metrics']): number {
    return (
      (metrics?.comments || 0) +
      (metrics?.likes || 0) +
      (metrics?.shares || 0) +
      (metrics?.views || 0)
    );
  }

  private toSnapshotDate(): Date {
    const snapshotDate = new Date();
    snapshotDate.setUTCHours(0, 0, 0, 0);
    return snapshotDate;
  }

  private async getRemixCounts(
    sourceReferenceIds: string[],
    organizationId?: string,
    brandId?: string,
  ): Promise<Map<string, number>> {
    if (sourceReferenceIds.length === 0 || !organizationId || !brandId) {
      return new Map();
    }

    // Fetch remix lineages for this org+brand, then count source reference occurrences
    const lineages = await this.prisma.trendRemixLineage.findMany({
      include: { sourceReferences: { select: { id: true } } },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
      },
    });

    const countMap = new Map<string, number>();
    for (const lineage of lineages) {
      for (const ref of lineage.sourceReferences) {
        if (sourceReferenceIds.includes(ref.id)) {
          countMap.set(ref.id, (countMap.get(ref.id) ?? 0) + 1);
        }
      }
    }

    return countMap;
  }

  private async getBrandRemixCountsByAccount(
    organizationId?: string,
    brandId?: string,
    platform?: string,
  ): Promise<Map<string, number>> {
    if (!organizationId || !brandId) {
      return new Map();
    }

    const lineages = await this.prisma.trendRemixLineage.findMany({
      include: {
        sourceReferences: { select: { data: true, id: true } },
      },
      where: {
        brandId,
        isDeleted: false,
        organizationId,
      },
    });

    const countMap = new Map<string, number>();
    for (const lineage of lineages) {
      for (const ref of lineage.sourceReferences) {
        const d = ref.data as unknown as Record<string, unknown>;
        const authorHandle = d.authorHandle as string | undefined;
        const refPlatform = d.platform as string | undefined;
        if (!authorHandle || !refPlatform) continue;
        if (platform && refPlatform !== platform) continue;
        const key = `${refPlatform}:${authorHandle}`;
        countMap.set(key, (countMap.get(key) ?? 0) + 1);
      }
    }

    return countMap;
  }

  private toReferenceRecord(
    id: string,
    data: ReferenceRecordData,
    createdAt: Date,
    remixCounts: Map<string, number>,
  ): TrendSourceReferenceRecord {
    return {
      authorHandle: data.authorHandle,
      canonicalUrl: data.canonicalUrl,
      contentType: data.contentType,
      currentEngagementTotal: data.currentEngagementTotal,
      currentMetrics: data.currentMetrics,
      firstSeenAt: data.firstSeenAt ?? createdAt.toISOString(),
      id,
      lastSeenAt: data.lastSeenAt,
      latestTrendMentions: data.latestTrendMentions,
      latestTrendViralityScore: data.latestTrendViralityScore,
      matchedTrendTopics: data.matchedTrendTopics,
      mediaUrl: data.mediaUrl,
      platform: data.platform,
      publishedAt: data.publishedAt,
      remixCount: remixCounts.get(id) || 0,
      sourcePreviewState: data.sourcePreviewState,
      text: data.text,
      thumbnailUrl: data.thumbnailUrl,
      title: data.title,
    };
  }
}
