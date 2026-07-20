import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import {
  type BatchConfig,
  type BatchItemFull,
  type BatchWithConfig,
  cloneBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BatchItemStatus, BatchStatus } from '@genfeedai/enums';
import type {
  IBatchReviewEvent,
  IBatchReviewEventReviewer,
  IBatchSummary,
} from '@genfeedai/interfaces';
import { Injectable } from '@nestjs/common';

type PostAnalyticsSummary = {
  analyticsRows: number;
  avgEngagementRate: number;
  totalComments: number;
  totalLikes: number;
  totalSaves: number;
  totalShares: number;
  totalViews: number;
};

type LinkedPostAnalytics = {
  engagementRate: number;
  postId: string;
  totalComments: number;
  totalLikes: number;
  totalSaves: number;
  totalShares: number;
  totalViews: number;
};

interface ReviewerMemberRecord {
  organizationId: string;
  user: {
    avatar: string | null;
    firstName: string | null;
    handle: string;
    id: string;
    isDeleted: boolean;
    lastName: string | null;
    name: string | null;
  };
}

@Injectable()
export class BatchGenerationSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishApprovalsService: PublishApprovalsService,
  ) {}

  async toBatchSummary(batch: BatchWithConfig): Promise<IBatchSummary> {
    const [summary] = await this.toBatchSummaries([batch]);
    return summary;
  }

  async toBatchSummaries(batches: BatchWithConfig[]): Promise<IBatchSummary[]> {
    const batchItemsById = new Map(
      batches.map((batch) => [batch.id, cloneBatchItems(batch.items)]),
    );
    const postIds = this.collectPostIds(batchItemsById);
    const organizationIds = this.collectOrganizationIds(batches);
    const reviewerIds = this.collectReviewerIds(batchItemsById);

    const linkedPosts =
      postIds.length > 0
        ? await this.prisma.post.findMany({
            select: {
              externalId: true,
              generationId: true,
              id: true,
              lastAttemptAt: true,
              promptUsed: true,
              publishedAt: true,
              retryCount: true,
              reviewDecision: true,
              reviewedAt: true,
              reviewFeedback: true,
              reviewVersionPinId: true,
              publishApproval: true,
              status: true,
              url: true,
            },
            where: {
              id: { in: postIds },
              isDeleted: false,
              organizationId: { in: organizationIds },
            },
          })
        : [];

    const linkedAnalytics =
      postIds.length > 0
        ? await this.prisma.postAnalytics.findMany({
            select: {
              engagementRate: true,
              postId: true,
              totalComments: true,
              totalLikes: true,
              totalSaves: true,
              totalShares: true,
              totalViews: true,
            },
            where: {
              isDeleted: false,
              organizationId: { in: organizationIds },
              postId: { in: postIds },
            },
          })
        : [];
    const analyticsMap = this.buildAnalyticsMap(linkedAnalytics);
    const linkedPostMap = new Map(linkedPosts.map((post) => [post.id, post]));
    const reviewerMap = await this.loadReviewerMap(
      organizationIds,
      reviewerIds,
    );

    return batches.map((batch) => {
      const batchConfig = (batch.config ?? {}) as BatchConfig;
      const batchItems = batchItemsById.get(batch.id) ?? [];
      const pendingCount = this.countPendingItems(batchItems);

      return {
        brandId: batch.brandId ?? '',
        completedAt: batchConfig.completedAt,
        completedCount: batchConfig.completedCount ?? 0,
        contentMix: {
          carouselPercent: batchConfig.contentMix?.carouselPercent ?? 10,
          imagePercent: batchConfig.contentMix?.imagePercent ?? 60,
          reelPercent: batchConfig.contentMix?.reelPercent ?? 5,
          storyPercent: batchConfig.contentMix?.storyPercent ?? 0,
          videoPercent: batchConfig.contentMix?.videoPercent ?? 25,
        },
        createdAt: batch.createdAt.toISOString(),
        failedCount: batchConfig.failedCount ?? 0,
        id: batch.id,
        items: batchItems.map((item) => {
          const linkedPost = item.postId
            ? linkedPostMap.get(item.postId)
            : undefined;
          const analytics = item.postId
            ? analyticsMap.get(item.postId)
            : undefined;

          return {
            batchId: batch.id,
            caption: item.caption,
            createdAt: item.createdAt ?? batch.createdAt.toISOString(),
            error: item.error,
            format: item.format,
            gateOverallScore: item.gateOverallScore,
            gateReasons: item.gateReasons ?? [],
            id: item._id,
            mediaUrl: item.mediaUrl,
            opportunitySourceType: item.opportunitySourceType,
            opportunityTopic: item.opportunityTopic,
            platform: item.platform,
            postAvgEngagementRate: analytics?.avgEngagementRate,
            postExternalId: linkedPost?.externalId ?? undefined,
            postGenerationId: linkedPost?.generationId ?? undefined,
            postId: item.postId,
            postLastAttemptAt: linkedPost?.lastAttemptAt?.toISOString(),
            postPromptUsed: linkedPost?.promptUsed ?? undefined,
            postPublishedAt: linkedPost?.publishedAt?.toISOString(),
            postRetryCount: linkedPost?.retryCount,
            postStatus: linkedPost?.status
              ? String(linkedPost.status)
              : undefined,
            postTotalComments: analytics?.totalComments,
            postTotalLikes: analytics?.totalLikes,
            postTotalSaves: analytics?.totalSaves,
            postTotalShares: analytics?.totalShares,
            postTotalViews: analytics?.totalViews,
            postUrl: linkedPost?.url ?? undefined,
            prompt: item.prompt,
            reviewDecision: item.reviewDecision,
            reviewEvents: this.toReviewEvents(
              item,
              batch.organizationId,
              reviewerMap,
            ),
            reviewedAt: item.reviewedAt,
            reviewFeedback: item.reviewFeedback,
            publishApproval:
              item.publishApproval ??
              (linkedPost?.publishApproval
                ? this.publishApprovalsService.toPublicInterface(
                    linkedPost.publishApproval,
                  )
                : undefined),
            scheduledDate: item.scheduledDate,
            sourceActionId: item.sourceActionId,
            sourceWorkflowId: item.sourceWorkflowId,
            sourceWorkflowName: item.sourceWorkflowName,
            status: item.status,
            versionPinId:
              item.versionPinId ?? linkedPost?.reviewVersionPinId ?? undefined,
          };
        }),
        pendingCount,
        platforms: batchConfig.platforms ?? [],
        status: String(batch.status) as BatchStatus,
        totalCount: batchConfig.totalCount ?? batchItems.length,
      };
    });
  }

  private collectOrganizationIds(batches: BatchWithConfig[]): string[] {
    return [...new Set(batches.map((batch) => batch.organizationId))];
  }

  private collectPostIds(
    batchItemsById: Map<string, BatchItemFull[]>,
  ): string[] {
    return [
      ...new Set(
        [...batchItemsById.values()]
          .flat()
          .flatMap((item) => (item.postId ? [item.postId] : [])),
      ),
    ];
  }

  private countPendingItems(batchItems: BatchItemFull[]): number {
    return batchItems.filter(
      (item) =>
        item.status === BatchItemStatus.PENDING ||
        item.status === BatchItemStatus.GENERATING,
    ).length;
  }

  private collectReviewerIds(
    batchItemsById: Map<string, BatchItemFull[]>,
  ): string[] {
    return [
      ...new Set(
        [...batchItemsById.values()]
          .flat()
          .flatMap((item) =>
            (item.reviewEvents ?? []).flatMap((event) =>
              event.reviewerId ? [event.reviewerId] : [],
            ),
          ),
      ),
    ];
  }

  private async loadReviewerMap(
    organizationIds: string[],
    reviewerIds: string[],
  ): Promise<Map<string, IBatchReviewEventReviewer>> {
    if (reviewerIds.length === 0) {
      return new Map();
    }

    const reviewerMembers = (await this.prisma.member.findMany({
      select: {
        organizationId: true,
        user: {
          select: {
            avatar: true,
            firstName: true,
            handle: true,
            id: true,
            isDeleted: true,
            lastName: true,
            name: true,
          },
        },
      },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: { in: organizationIds },
        userId: { in: reviewerIds },
      },
    })) as unknown as ReviewerMemberRecord[];

    return new Map(
      reviewerMembers
        .filter((member) => !member.user.isDeleted)
        .map((member) => [
          this.reviewerKey(member.organizationId, member.user.id),
          this.toReviewEventReviewer(member),
        ]),
    );
  }

  private toReviewEvents(
    item: BatchItemFull,
    organizationId: string,
    reviewerMap: Map<string, IBatchReviewEventReviewer>,
  ): IBatchReviewEvent[] {
    return (item.reviewEvents ?? []).map((event) => ({
      decision: event.decision,
      feedback: event.feedback,
      reviewedAt: event.reviewedAt,
      reviewer: event.reviewerId
        ? reviewerMap.get(this.reviewerKey(organizationId, event.reviewerId))
        : undefined,
      reviewerId: event.reviewerId,
      versionPinId: event.versionPinId,
    }));
  }

  private buildAnalyticsMap(
    linkedAnalytics: LinkedPostAnalytics[],
  ): Map<string, PostAnalyticsSummary> {
    const analyticsMap = new Map<string, PostAnalyticsSummary>();
    for (const row of linkedAnalytics) {
      const existing = analyticsMap.get(row.postId);
      if (!existing) {
        analyticsMap.set(row.postId, {
          analyticsRows: 1,
          avgEngagementRate: row.engagementRate,
          totalComments: row.totalComments,
          totalLikes: row.totalLikes,
          totalSaves: row.totalSaves,
          totalShares: row.totalShares,
          totalViews: row.totalViews,
        });
      } else {
        const analyticsRows = existing.analyticsRows + 1;
        analyticsMap.set(row.postId, {
          analyticsRows,
          avgEngagementRate:
            (existing.avgEngagementRate * existing.analyticsRows +
              row.engagementRate) /
            analyticsRows,
          totalComments: Math.max(existing.totalComments, row.totalComments),
          totalLikes: Math.max(existing.totalLikes, row.totalLikes),
          totalSaves: Math.max(existing.totalSaves, row.totalSaves),
          totalShares: Math.max(existing.totalShares, row.totalShares),
          totalViews: Math.max(existing.totalViews, row.totalViews),
        });
      }
    }
    return analyticsMap;
  }

  private reviewerKey(organizationId: string, userId: string): string {
    return `${organizationId}:${userId}`;
  }

  private toReviewEventReviewer(
    member: ReviewerMemberRecord,
  ): IBatchReviewEventReviewer {
    const fullName = [member.user.firstName, member.user.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      ...(member.user.avatar ? { avatar: member.user.avatar } : {}),
      displayName:
        member.user.name ||
        fullName ||
        member.user.handle ||
        `Team member ${member.user.id.slice(0, 8)}`,
      handle: member.user.handle,
      id: member.user.id,
    };
  }
}
