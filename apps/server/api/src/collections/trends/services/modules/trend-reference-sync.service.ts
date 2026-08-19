import type { TrendSourceItem } from '@api/collections/trends/interfaces/trend.interfaces';
import type {
  SyncTrendReferenceInput,
  TrendReferenceRecordData,
} from '@api/collections/trends/services/trend-reference-corpus.types';
import { getTrendEngagementTotal } from '@api/collections/trends/utils/trend-engagement.util';
import { normalizeTrendSourceClassification } from '@api/collections/trends/utils/trend-source-classification.util';
import { normalizeTrendSourceUrl } from '@api/collections/trends/utils/trend-source-url.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface TrendReferenceSyncResult {
  links: number;
  references: number;
  snapshots: number;
}

interface SyncedSourceResult {
  linkCreated: boolean;
  snapshotCreated: boolean;
}

/**
 * Owns persistence for reference records, daily snapshots, and trend links.
 */
@Injectable()
export class TrendReferenceSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
  ) {}

  async syncTrendReferences(
    trends: SyncTrendReferenceInput[],
  ): Promise<TrendReferenceSyncResult> {
    const result: TrendReferenceSyncResult = {
      links: 0,
      references: 0,
      snapshots: 0,
    };

    for (const trend of trends) {
      for (const sourceItem of trend.sourcePreview) {
        if (!sourceItem.sourceUrl) {
          continue;
        }

        const synced = await this.syncSourceReference(
          trend,
          sourceItem,
          sourceItem.sourceUrl,
        );
        result.references += 1;
        result.links += synced.linkCreated ? 1 : 0;
        result.snapshots += synced.snapshotCreated ? 1 : 0;
      }
    }

    return result;
  }

  private async syncSourceReference(
    trend: SyncTrendReferenceInput,
    sourceItem: TrendSourceItem,
    sourceUrl: string,
  ): Promise<SyncedSourceResult> {
    const canonicalUrl = this.normalizeSourceUrl(sourceUrl);
    const matchedReference = await this.prisma.trendSourceReference.findFirst({
      where: {
        canonicalUrl,
        isDeleted: false,
        platform: sourceItem.platform,
      },
    });
    const engagementTotal = getTrendEngagementTotal(sourceItem.metrics);
    const now = new Date();
    const referenceId = matchedReference
      ? await this.updateReference({
          canonicalUrl,
          engagementTotal,
          existingData:
            matchedReference.data as unknown as TrendReferenceRecordData,
          id: matchedReference.id,
          now,
          sourceItem,
          trend,
        })
      : await this.createReference({
          canonicalUrl,
          engagementTotal,
          now,
          sourceItem,
          trend,
        });
    const snapshotCreated = await this.upsertDailySnapshot(
      referenceId,
      engagementTotal,
      sourceItem,
      trend,
    );
    const linkCreated = await this.upsertTrendLink(referenceId, trend.id);

    return { linkCreated, snapshotCreated };
  }

  private async updateReference(input: {
    canonicalUrl: string;
    engagementTotal: number;
    existingData: TrendReferenceRecordData;
    id: string;
    now: Date;
    sourceItem: TrendSourceItem;
    trend: SyncTrendReferenceInput;
  }): Promise<string> {
    const matchedTopics = Array.isArray(input.existingData.matchedTrendTopics)
      ? input.existingData.matchedTrendTopics
      : [];
    const updatedTopics = matchedTopics.includes(input.trend.topic)
      ? matchedTopics
      : [...matchedTopics, input.trend.topic];
    const sourceClassification = this.buildReferenceSourceClassification({
      capturedAt: input.now,
      existingClassification: input.existingData.sourceClassification,
      sourceItem: input.sourceItem,
      trend: input.trend,
    });

    await this.prisma.trendSourceReference.update({
      data: {
        authorHandle: input.sourceItem.authorHandle,
        canonicalUrl: input.canonicalUrl,
        currentEngagementTotal: input.engagementTotal,
        data: toPrismaJson({
          ...input.existingData,
          authorHandle: input.sourceItem.authorHandle,
          canonicalUrl: input.canonicalUrl,
          contentType: input.sourceItem.contentType,
          currentEngagementTotal: input.engagementTotal,
          currentMetrics: input.sourceItem.metrics || {},
          externalId: input.sourceItem.id,
          lastSeenAt: input.now.toISOString(),
          latestTrendMentions: input.trend.mentions,
          latestTrendViralityScore: input.trend.viralityScore,
          matchedTrendTopics: updatedTopics,
          mediaUrl: input.sourceItem.mediaUrl,
          publishedAt: input.sourceItem.publishedAt
            ? new Date(input.sourceItem.publishedAt).toISOString()
            : undefined,
          sourceClassification,
          sourcePreviewState: input.trend.sourcePreviewState,
          text: input.sourceItem.text,
          thumbnailUrl: input.sourceItem.thumbnailUrl,
          title: input.sourceItem.title,
        }),
        lastSeenAt: input.now,
        latestTrendViralityScore: input.trend.viralityScore,
        platform: input.sourceItem.platform,
      },
      where: { id: input.id },
    });

    return input.id;
  }

  private async createReference(input: {
    canonicalUrl: string;
    engagementTotal: number;
    now: Date;
    sourceItem: TrendSourceItem;
    trend: SyncTrendReferenceInput;
  }): Promise<string> {
    const sourceClassification = this.buildReferenceSourceClassification({
      capturedAt: input.now,
      sourceItem: input.sourceItem,
      trend: input.trend,
    });
    const created = await this.prisma.trendSourceReference.create({
      data: {
        authorHandle: input.sourceItem.authorHandle,
        canonicalUrl: input.canonicalUrl,
        currentEngagementTotal: input.engagementTotal,
        data: toPrismaJson({
          authorHandle: input.sourceItem.authorHandle,
          canonicalUrl: input.canonicalUrl,
          contentType: input.sourceItem.contentType,
          currentEngagementTotal: input.engagementTotal,
          currentMetrics: input.sourceItem.metrics || {},
          externalId: input.sourceItem.id,
          firstSeenAt: input.now.toISOString(),
          lastSeenAt: input.now.toISOString(),
          latestTrendMentions: input.trend.mentions,
          latestTrendViralityScore: input.trend.viralityScore,
          matchedTrendTopics: [input.trend.topic],
          mediaUrl: input.sourceItem.mediaUrl,
          platform: input.sourceItem.platform,
          publishedAt: input.sourceItem.publishedAt
            ? new Date(input.sourceItem.publishedAt).toISOString()
            : undefined,
          sourceClassification,
          sourcePreviewState: input.trend.sourcePreviewState,
          text: input.sourceItem.text,
          thumbnailUrl: input.sourceItem.thumbnailUrl,
          title: input.sourceItem.title,
        }),
        isDeleted: false,
        lastSeenAt: input.now,
        latestTrendViralityScore: input.trend.viralityScore,
        platform: input.sourceItem.platform,
      },
    });

    return created.id;
  }

  private async upsertDailySnapshot(
    referenceId: string,
    engagementTotal: number,
    sourceItem: TrendSourceItem,
    trend: SyncTrendReferenceInput,
  ): Promise<boolean> {
    const snapshotDate = this.toSnapshotDate();
    const matchedSnapshot =
      await this.prisma.trendSourceReferenceSnapshot.findFirst({
        where: {
          isDeleted: false,
          snapshotDate,
          sourceReferenceId: referenceId,
        },
      });
    const data = {
      engagementTotal,
      metrics: sourceItem.metrics || {},
      snapshotDate: snapshotDate.toISOString(),
      trendMentions: trend.mentions,
      trendViralityScore: trend.viralityScore,
    };

    if (matchedSnapshot) {
      await this.prisma.trendSourceReferenceSnapshot.update({
        data: { data: toPrismaJson(data), snapshotDate },
        where: { id: matchedSnapshot.id },
      });
      return false;
    }

    await this.prisma.trendSourceReferenceSnapshot.create({
      data: {
        data: toPrismaJson(data),
        isDeleted: false,
        snapshotDate,
        sourceReferenceId: referenceId,
      },
    });
    return true;
  }

  private async upsertTrendLink(
    referenceId: string,
    trendId: string,
  ): Promise<boolean> {
    const existingLink = await this.prisma.trendSourceReferenceLink.findFirst({
      where: {
        isDeleted: false,
        sourceReferenceId: referenceId,
        trendId,
      },
    });

    if (existingLink) {
      return false;
    }

    await this.prisma.trendSourceReferenceLink.create({
      data: {
        isDeleted: false,
        sourceReferenceId: referenceId,
        trendId,
      },
    });
    return true;
  }

  private buildReferenceSourceClassification(input: {
    capturedAt: Date;
    existingClassification?: TrendReferenceRecordData['sourceClassification'];
    sourceItem: TrendSourceItem;
    trend: SyncTrendReferenceInput;
  }): TrendReferenceRecordData['sourceClassification'] {
    return normalizeTrendSourceClassification({
      capturedAt: input.capturedAt,
      confidence: 'medium',
      intendedUse: 'organic_trend_discovery',
      platform: input.sourceItem.platform,
      sourceAuthor: input.sourceItem.authorHandle,
      sourceKind: 'public_platform_reference',
      sourceLabel:
        input.sourceItem.sourceClassification?.sourceLabel ??
        input.sourceItem.platform,
      sourceTimestamp: input.sourceItem.publishedAt,
      sourceTopic: input.trend.topic,
      value:
        input.sourceItem.sourceClassification ?? input.existingClassification,
    });
  }

  private normalizeSourceUrl(url: string): string {
    const result = normalizeTrendSourceUrl(url);
    if (!result.ok) {
      this.loggerService.warn('Failed to normalize source URL', {
        error:
          result.error instanceof Error
            ? result.error.message
            : String(result.error),
        url,
      });
    }
    return result.normalizedUrl;
  }

  private toSnapshotDate(): Date {
    const snapshotDate = new Date();
    snapshotDate.setUTCHours(0, 0, 0, 0);
    return snapshotDate;
  }
}
