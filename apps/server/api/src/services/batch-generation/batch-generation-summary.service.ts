import { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import {
  type BatchConfig,
  type BatchItemFull,
  type BatchWithConfig,
  resolveBatchItems,
} from '@api/services/batch-generation/batch-generation.types';
import { fromPrismaBatchStatus } from '@api/services/batch-generation/batch-status-prisma.mapper';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BatchItemStatus } from '@genfeedai/enums';
import type {
  IBatchReviewEvent,
  IBatchReviewEventReviewer,
  IBatchSummary,
} from '@genfeedai/interfaces';
import { serializeBatchItemAssignee } from '@genfeedai/serializers';
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
      batches.map((batch) => [batch.id, resolveBatchItems(batch)]),
    );
    const { analyticsMap, linkedPostMap, memberIdentityMap } =
      await this.loadSummaryRelations(batches, batchItemsById);

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

          const assigneeId = item.assigneeId ?? null;
          const assignee = assigneeId
            ? memberIdentityMap.get(
                this.reviewerKey(batch.organizationId, assigneeId),
              )
            : undefined;

          return {
            assignee: assignee
              ? serializeBatchItemAssignee(assignee)
              : undefined,
            assigneeId: assigneeId || undefined,
            batchId: batch.id,
            caption: item.caption,
            contentRunId: item.contentRunId,
            createdAt: item.createdAt ?? batch.createdAt.toISOString(),
            error: item.error,
            format: item.format,
            gateOverallScore: item.gateOverallScore,
            gateReasons: item.gateReasons ?? [],
            id: item.id,
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
              memberIdentityMap,
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
            engagementAction: item.engagementAction,
            targetAuthor: item.targetAuthor,
            targetPostContent: item.targetPostContent,
            targetPostId: item.targetPostId,
            targetPostUrl: item.targetPostUrl,
            type: item.type,
            versionPinId:
              item.versionPinId ?? linkedPost?.reviewVersionPinId ?? undefined,
            variantId: item.variantId,
          };
        }),
        pendingCount,
        platforms: batchConfig.platforms ?? [],
        status: fromPrismaBatchStatus(String(batch.status)),
        totalCount: batchConfig.totalCount ?? batchItems.length,
      };
    });
  }

  private async loadSummaryRelations(
    batches: BatchWithConfig[],
    batchItemsById: Map<string, BatchItemFull[]>,
  ) {
    const postIds = this.collectPostIds(batchItemsById);
    const organizationIds = this.collectOrganizationIds(batches);
    const reviewerIds = this.collectReviewerIds(batchItemsById);
    const assigneeIds = this.collectAssigneeIds(batchItemsById);

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
              organizationId: { in: organizationIds },
              postId: { in: postIds },
            },
          })
        : [];
    const analyticsMap = this.buildAnalyticsMap(linkedAnalytics);
    const linkedPostMap = new Map(linkedPosts.map((post) => [post.id, post]));
    const memberIdentityMap = await this.loadMemberIdentityMap(
      organizationIds,
      [...new Set([...reviewerIds, ...assigneeIds])],
    );
    return { analyticsMap, linkedPostMap, memberIdentityMap };
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
        item.status === BatchItemStatus.PROCESSING,
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

  private collectAssigneeIds(
    batchItemsById: Map<string, BatchItemFull[]>,
  ): string[] {
    return [
      ...new Set(
        [...batchItemsById.values()]
          .flat()
          .flatMap((item) => (item.assigneeId ? [item.assigneeId] : [])),
      ),
    ];
  }

  private async loadMemberIdentityMap(
    organizationIds: string[],
    userIds: string[],
  ): Promise<Map<string, ReviewerMemberRecord['user']>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const members = (await this.prisma.member.findMany({
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
        userId: { in: userIds },
      },
    })) as unknown as ReviewerMemberRecord[];

    return new Map(
      members
        .filter((member) => !member.user.isDeleted)
        .map((member) => [
          this.reviewerKey(member.organizationId, member.user.id),
          member.user,
        ]),
    );
  }

  private toReviewEvents(
    item: BatchItemFull,
    organizationId: string,
    memberIdentityMap: Map<string, ReviewerMemberRecord['user']>,
  ): IBatchReviewEvent[] {
    return (item.reviewEvents ?? []).map((event) => ({
      decision: event.decision,
      feedback: event.feedback,
      reviewedAt: event.reviewedAt,
      reviewer: event.reviewerId
        ? this.toReviewEventReviewer(
            memberIdentityMap.get(
              this.reviewerKey(organizationId, event.reviewerId),
            ),
          )
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
    user: ReviewerMemberRecord['user'] | undefined,
  ): IBatchReviewEventReviewer | undefined {
    if (!user) {
      return undefined;
    }

    const assignee = serializeBatchItemAssignee(user);
    return {
      ...(user.avatar ? { avatar: user.avatar } : {}),
      ...assignee,
    };
  }
}
