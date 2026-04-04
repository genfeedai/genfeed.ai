import type {
  TrendSourceAccountResult,
  TrendSourceAccountSummary,
  TrendSourceItem,
  TrendSourceReferenceRecord,
  TrendSourceReferenceResult,
} from '@api/collections/trends/interfaces/trend.interfaces';
import {
  TrendRemixLineage,
  type TrendRemixLineageDocument,
} from '@api/collections/trends/schemas/trend-remix-lineage.schema';
import {
  TrendSourceReference,
  type TrendSourceReferenceDocument,
} from '@api/collections/trends/schemas/trend-source-reference.schema';
import {
  TrendSourceReferenceLink,
  type TrendSourceReferenceLinkDocument,
} from '@api/collections/trends/schemas/trend-source-reference-link.schema';
import {
  TrendSourceReferenceSnapshot,
  type TrendSourceReferenceSnapshotDocument,
} from '@api/collections/trends/schemas/trend-source-reference-snapshot.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';

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

interface ReferenceRecordDocument {
  _id: Types.ObjectId;
  authorHandle?: string;
  canonicalUrl: string;
  contentType: TrendSourceItem['contentType'];
  currentEngagementTotal: number;
  currentMetrics?: TrendSourceItem['metrics'];
  firstSeenAt: Date;
  lastSeenAt: Date;
  latestTrendMentions: number;
  latestTrendViralityScore: number;
  matchedTrendTopics: string[];
  mediaUrl?: string;
  platform: string;
  publishedAt?: Date;
  sourcePreviewState: 'live' | 'fallback' | 'empty';
  text?: string;
  thumbnailUrl?: string;
  title?: string;
}

@Injectable()
export class TrendReferenceCorpusService {
  constructor(
    @InjectModel(TrendSourceReference.name, DB_CONNECTIONS.CLOUD)
    private readonly trendSourceReferenceModel: Model<TrendSourceReferenceDocument>,
    @InjectModel(TrendSourceReferenceSnapshot.name, DB_CONNECTIONS.CLOUD)
    private readonly trendSourceReferenceSnapshotModel: Model<TrendSourceReferenceSnapshotDocument>,
    @InjectModel(TrendSourceReferenceLink.name, DB_CONNECTIONS.CLOUD)
    private readonly trendSourceReferenceLinkModel: Model<TrendSourceReferenceLinkDocument>,
    @InjectModel(TrendRemixLineage.name, DB_CONNECTIONS.CLOUD)
    private readonly trendRemixLineageModel: Model<TrendRemixLineageDocument>,
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
        const reference = await this.trendSourceReferenceModel.findOneAndUpdate(
          {
            canonicalUrl,
            isDeleted: false,
            platform: sourceItem.platform,
          },
          {
            $addToSet: {
              matchedTrendTopics: trend.topic,
            },
            $set: {
              authorHandle: sourceItem.authorHandle,
              contentType: sourceItem.contentType,
              currentEngagementTotal: this.getEngagementTotal(
                sourceItem.metrics,
              ),
              currentMetrics: sourceItem.metrics || {},
              externalId: sourceItem.id,
              lastSeenAt: new Date(),
              latestTrendMentions: trend.mentions,
              latestTrendViralityScore: trend.viralityScore,
              mediaUrl: sourceItem.mediaUrl,
              publishedAt: sourceItem.publishedAt
                ? new Date(sourceItem.publishedAt)
                : undefined,
              sourcePreviewState: trend.sourcePreviewState,
              text: sourceItem.text,
              thumbnailUrl: sourceItem.thumbnailUrl,
              title: sourceItem.title,
            },
            $setOnInsert: {
              canonicalUrl,
              firstSeenAt: new Date(),
              isDeleted: false,
              platform: sourceItem.platform,
            },
          },
          {
            new: true,
            upsert: true,
          },
        );
        references += 1;

        const snapshotResult =
          await this.trendSourceReferenceSnapshotModel.updateOne(
            {
              isDeleted: false,
              snapshotDate: this.toSnapshotDate(),
              sourceReference: reference._id,
            },
            {
              $set: {
                engagementTotal: this.getEngagementTotal(sourceItem.metrics),
                metrics: sourceItem.metrics || {},
                trendMentions: trend.mentions,
                trendViralityScore: trend.viralityScore,
              },
              $setOnInsert: {
                isDeleted: false,
                snapshotDate: this.toSnapshotDate(),
                sourceReference: reference._id,
              },
            },
            {
              upsert: true,
            },
          );
        snapshots += snapshotResult.upsertedCount ?? 0;

        const linkResult = await this.trendSourceReferenceLinkModel.updateOne(
          {
            isDeleted: false,
            sourceReference: reference._id,
            trend: new Types.ObjectId(trend.id),
          },
          {
            $set: {
              matchReason: `source-preview:${trend.sourcePreviewState}`,
              rankAtCapture:
                trend.sourcePreview.findIndex(
                  (item) => item.sourceUrl === sourceItem.sourceUrl,
                ) + 1,
            },
            $setOnInsert: {
              isDeleted: false,
              matchedAt: new Date(),
              sourceReference: reference._id,
              trend: new Types.ObjectId(trend.id),
            },
          },
          {
            upsert: true,
          },
        );
        links += linkResult.upsertedCount ?? 0;
      }
    }

    return { links, references, snapshots };
  }

  async countGlobalReferences(): Promise<number> {
    return this.trendSourceReferenceModel.countDocuments({
      isDeleted: false,
    });
  }

  async recordDraftRemixLineage(payload: RemixLineagePayload): Promise<void> {
    const hasContentDraftId =
      typeof payload.contentDraftId === 'string' &&
      Types.ObjectId.isValid(payload.contentDraftId);
    const hasPostId =
      typeof payload.postId === 'string' &&
      Types.ObjectId.isValid(payload.postId);

    if (!hasContentDraftId && !hasPostId) {
      return;
    }

    const sourceReferenceIds = await this.resolveSourceReferenceIds(
      payload.metadata,
    );
    const trendIds = [
      ...this.parseObjectIdArray(payload.metadata?.trendIds),
      ...this.parseOptionalObjectId(payload.metadata?.trendId),
    ];
    const sourceUrls = [
      ...this.parseStringArray(payload.metadata?.sourceUrls),
      ...this.parseOptionalString(payload.metadata?.sourceUrl),
    ];

    if (sourceReferenceIds.length === 0 && trendIds.length === 0) {
      return;
    }

    await this.trendRemixLineageModel.updateOne(
      hasContentDraftId
        ? {
            contentDraft: new Types.ObjectId(payload.contentDraftId),
          }
        : {
            post: new Types.ObjectId(payload.postId!),
          },
      {
        $set: {
          brand: new Types.ObjectId(payload.brandId),
          draftType: payload.draftType,
          generatedBy: payload.generatedBy,
          isDeleted: false,
          organization: new Types.ObjectId(payload.organizationId),
          platforms: payload.platforms,
          prompt: payload.prompt,
          sourceReferences: sourceReferenceIds,
          sourceUrls,
          trends: trendIds,
          ...(hasContentDraftId
            ? {
                contentDraft: new Types.ObjectId(payload.contentDraftId),
              }
            : {}),
          ...(hasPostId
            ? {
                post: new Types.ObjectId(payload.postId!),
              }
            : {}),
        },
      },
      {
        upsert: true,
      },
    );
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
    const references = await this.trendSourceReferenceModel
      .find({
        canonicalUrl: {
          $in: canonicalUrls,
        },
        isDeleted: false,
      })
      .select('_id canonicalUrl')
      .lean();

    if (references.length === 0) {
      return items;
    }

    const referenceMap = new Map(
      references.map((reference) => [
        reference.canonicalUrl,
        String(reference._id),
      ]),
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
    const filter: Record<string, unknown> = {
      isDeleted: false,
    };

    if (options.platform) {
      filter.platform = options.platform;
    }

    if (options.authorHandle) {
      filter.authorHandle = options.authorHandle;
    }

    if (options.trendId && Types.ObjectId.isValid(options.trendId)) {
      const links = await this.trendSourceReferenceLinkModel
        .find({
          isDeleted: false,
          trend: new Types.ObjectId(options.trendId),
        })
        .lean();

      const sourceReferenceIds = links.map((item) => item.sourceReference);
      filter._id =
        sourceReferenceIds.length > 0
          ? { $in: sourceReferenceIds }
          : { $in: [] };
    }

    const docs = await this.trendSourceReferenceModel
      .find(filter)
      .sort({
        currentEngagementTotal: -1,
        lastSeenAt: -1,
        latestTrendViralityScore: -1,
      })
      .limit(limit)
      .lean();

    const remixCounts = await this.getRemixCounts(
      docs.map((doc) => doc._id),
      organizationId,
      brandId,
    );

    return {
      items: docs.map((doc) => this.toReferenceRecord(doc, remixCounts)),
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
    const matchStage: Record<string, unknown> = {
      authorHandle: {
        $exists: true,
        $ne: '',
      },
      isDeleted: false,
    };

    if (options.platform) {
      matchStage.platform = options.platform;
    }

    const aggregated = (await this.trendSourceReferenceModel.aggregate([
      {
        $match: matchStage,
      },
      {
        $group: {
          _id: {
            authorHandle: '$authorHandle',
            platform: '$platform',
          },
          avgTrendViralityScore: {
            $avg: '$latestTrendViralityScore',
          },
          lastSeenAt: {
            $max: '$lastSeenAt',
          },
          referenceCount: {
            $sum: 1,
          },
          totalEngagement: {
            $sum: '$currentEngagementTotal',
          },
        },
      },
      {
        $sort: {
          avgTrendViralityScore: -1,
          referenceCount: -1,
          totalEngagement: -1,
        },
      },
      {
        $limit: limit,
      },
    ])) as Array<{
      _id: {
        authorHandle: string;
        platform: string;
      };
      avgTrendViralityScore: number;
      lastSeenAt?: Date;
      referenceCount: number;
      totalEngagement: number;
    }>;

    const brandRemixCounts = await this.getBrandRemixCountsByAccount(
      organizationId,
      brandId,
      options.platform,
    );

    const accounts: TrendSourceAccountSummary[] = aggregated.map((account) => {
      const lookupKey = `${account._id.platform}:${account._id.authorHandle}`;

      return {
        authorHandle: account._id.authorHandle,
        avgTrendViralityScore: Math.round(account.avgTrendViralityScore || 0),
        brandRemixCount: brandRemixCounts.get(lookupKey) || 0,
        lastSeenAt: account.lastSeenAt?.toISOString(),
        platform: account._id.platform,
        referenceCount: account.referenceCount,
        totalEngagement: account.totalEngagement,
      };
    });

    return {
      accounts,
      totalAccounts: accounts.length,
    };
  }

  private async resolveSourceReferenceIds(
    metadata?: Record<string, unknown>,
  ): Promise<Types.ObjectId[]> {
    const explicitIds = [
      ...this.parseObjectIdArray(metadata?.sourceReferenceIds),
      ...this.parseOptionalObjectId(metadata?.sourceReferenceId),
    ];
    if (explicitIds.length > 0) {
      return Array.from(
        new Map(explicitIds.map((id) => [String(id), id])).values(),
      );
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
    const refs = await this.trendSourceReferenceModel
      .find({
        canonicalUrl: {
          $in: normalizedUrls,
        },
        isDeleted: false,
      })
      .select('_id')
      .lean();

    return refs.map((ref) => ref._id);
  }

  private parseOptionalObjectId(value: unknown): Types.ObjectId[] {
    if (typeof value !== 'string' || !Types.ObjectId.isValid(value)) {
      return [];
    }

    return [new Types.ObjectId(value)];
  }

  private parseOptionalString(value: unknown): string[] {
    if (typeof value !== 'string' || value.length === 0) {
      return [];
    }

    return [value];
  }

  private parseObjectIdArray(value: unknown): Types.ObjectId[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .filter((entry) => Types.ObjectId.isValid(entry))
      .map((entry) => new Types.ObjectId(entry));
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
    sourceReferenceIds: Types.ObjectId[],
    organizationId?: string,
    brandId?: string,
  ): Promise<Map<string, number>> {
    if (
      sourceReferenceIds.length === 0 ||
      !organizationId ||
      !brandId ||
      !Types.ObjectId.isValid(organizationId) ||
      !Types.ObjectId.isValid(brandId)
    ) {
      return new Map();
    }

    const rows = (await this.trendRemixLineageModel.aggregate([
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
          sourceReferences: {
            $in: sourceReferenceIds,
          },
        },
      },
      {
        $unwind: '$sourceReferences',
      },
      {
        $match: {
          sourceReferences: {
            $in: sourceReferenceIds,
          },
        },
      },
      {
        $group: {
          _id: '$sourceReferences',
          remixCount: {
            $sum: 1,
          },
        },
      },
    ])) as Array<{
      _id: Types.ObjectId;
      remixCount: number;
    }>;

    return new Map(rows.map((row) => [String(row._id), row.remixCount]));
  }

  private async getBrandRemixCountsByAccount(
    organizationId?: string,
    brandId?: string,
    platform?: string,
  ): Promise<Map<string, number>> {
    if (
      !organizationId ||
      !brandId ||
      !Types.ObjectId.isValid(organizationId) ||
      !Types.ObjectId.isValid(brandId)
    ) {
      return new Map();
    }

    const rows = (await this.trendRemixLineageModel.aggregate([
      {
        $match: {
          brand: new Types.ObjectId(brandId),
          isDeleted: false,
          organization: new Types.ObjectId(organizationId),
        },
      },
      {
        $unwind: '$sourceReferences',
      },
      {
        $lookup: {
          as: 'sourceReference',
          foreignField: '_id',
          from: 'trend-source-references',
          localField: 'sourceReferences',
        },
      },
      {
        $unwind: '$sourceReference',
      },
      {
        $match: {
          ...(platform
            ? {
                'sourceReference.platform': platform,
              }
            : {}),
          'sourceReference.authorHandle': {
            $exists: true,
            $ne: '',
          },
        },
      },
      {
        $group: {
          _id: {
            authorHandle: '$sourceReference.authorHandle',
            platform: '$sourceReference.platform',
          },
          brandRemixCount: {
            $sum: 1,
          },
        },
      },
    ])) as Array<{
      _id: {
        authorHandle: string;
        platform: string;
      };
      brandRemixCount: number;
    }>;

    return new Map(
      rows.map((row) => [
        `${row._id.platform}:${row._id.authorHandle}`,
        row.brandRemixCount,
      ]),
    );
  }

  private toReferenceRecord(
    doc: ReferenceRecordDocument,
    remixCounts: Map<string, number>,
  ): TrendSourceReferenceRecord {
    return {
      authorHandle: doc.authorHandle,
      canonicalUrl: doc.canonicalUrl,
      contentType: doc.contentType,
      currentEngagementTotal: doc.currentEngagementTotal,
      currentMetrics: doc.currentMetrics,
      firstSeenAt: doc.firstSeenAt.toISOString(),
      id: String(doc._id),
      lastSeenAt: doc.lastSeenAt.toISOString(),
      latestTrendMentions: doc.latestTrendMentions,
      latestTrendViralityScore: doc.latestTrendViralityScore,
      matchedTrendTopics: doc.matchedTrendTopics,
      mediaUrl: doc.mediaUrl,
      platform: doc.platform,
      publishedAt: doc.publishedAt?.toISOString(),
      remixCount: remixCounts.get(String(doc._id)) || 0,
      sourcePreviewState: doc.sourcePreviewState,
      text: doc.text,
      thumbnailUrl: doc.thumbnailUrl,
      title: doc.title,
    };
  }
}
