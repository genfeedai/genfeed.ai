import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { resolveBatchItems } from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { batchItemRowsInclude } from '@api/services/batch-generation/batch-item-rows';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivityKey,
  ActivitySource,
  BatchItemStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { getUserRoomName } from '@libs/websockets/room-name.util';
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class BatchGenerationRewriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postGenerationService: PostGenerationService,
    private readonly reviewService: BatchGenerationReviewService,
    private readonly activitiesService: ActivitiesService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async rewriteItems(
    batchId: string,
    itemIds: string[],
    organizationId: string,
    userId: string,
  ) {
    const batch = await this.prisma.batch.findFirst({
      include: batchItemRowsInclude(organizationId),
      where: { id: batchId, organizationId, isDeleted: false },
    });
    if (!batch) throw new NotFoundException('Batch', batchId);
    const selectedIds = new Set(itemIds);
    const items = resolveBatchItems(batch).filter((item) =>
      selectedIds.has(item.id),
    );
    if (
      !items.length ||
      items.length !== selectedIds.size ||
      items.some((item) => item.status !== BatchItemStatus.COMPLETED)
    ) {
      throw new BadRequestException('Select completed items from this batch');
    }
    const posts = await this.prisma.post.findMany({
      where: {
        id: { in: items.flatMap((item) => (item.postId ? [item.postId] : [])) },
        organizationId,
        isDeleted: false,
        brandId: batch.brandId,
      },
    });
    const postMap = new Map(posts.map((post) => [post.id, post]));
    for (const item of items) {
      if (!item.postId) continue;
      const post = postMap.get(item.postId);
      if (!post) throw new NotFoundException('Post', item.postId);
      if (
        post.targetExecutionState === TargetExecutionState.PUBLISHED ||
        post.targetExecutionState === TargetExecutionState.PUBLISHING ||
        post.targetExecutionState === TargetExecutionState.SKIPPED ||
        post.targetExecutionState === TargetExecutionState.CANCELLED
      ) {
        throw new BadRequestException('This post can no longer be rewritten');
      }
    }
    const activity = await this.activitiesService.create(
      new ActivityEntity({
        brandId: batch.brandId,
        organizationId,
        userId,
        key: ActivityKey.POST_PROCESSING,
        source: ActivitySource.POST_ENHANCEMENT,
        value: JSON.stringify({
          batchId,
          itemIds: [...selectedIds],
          type: 'batch-rewrite',
        }),
      }),
    );
    const task = {
      activityId: activity.id,
      taskId: activity.id,
      userId,
      room: getUserRoomName(userId),
      label: 'Batch rewrite',
    };
    try {
      await this.websocketService.publishBackgroundTaskUpdate({
        ...task,
        progress: 0,
        status: 'processing',
      });
      const captions = new Map<string, string>();
      for (const item of items) {
        const post = item.postId ? postMap.get(item.postId) : undefined;
        const caption = await this.postGenerationService.enhanceDescription(
          {
            description: post?.description ?? item.caption ?? item.prompt ?? '',
            platform: post?.platform ?? item.platform ?? null,
          },
          {
            prompt:
              'Rewrite this content to improve clarity, specificity, and engagement while preserving its meaning and brand voice.',
          },
          { organizationId },
        );
        if (!caption.trim())
          throw new BadRequestException('Rewrite returned empty content');
        captions.set(item.id, caption);
        await this.websocketService.publishBackgroundTaskUpdate({
          ...task,
          progress: Math.round((captions.size / items.length) * 90),
          status: 'processing',
        });
      }
      const result = await this.reviewService.applyRewrites(
        batchId,
        organizationId,
        userId,
        batch.updatedAt,
        captions,
        new Map(posts.map((post) => [post.id, post.updatedAt])),
      );
      await this.activitiesService.patch(activity.id, {
        key: ActivityKey.POST_GENERATED,
        source: ActivitySource.POST_ENHANCEMENT,
        isRead: false,
        organizationId,
      });
      await this.websocketService.publishBackgroundTaskUpdate({
        ...task,
        progress: 100,
        status: 'completed',
      });
      return result;
    } catch (error) {
      await this.activitiesService.patch(activity.id, {
        key: ActivityKey.POST_FAILED,
        source: ActivitySource.POST_ENHANCEMENT,
        isRead: false,
        organizationId,
      });
      await this.websocketService.publishBackgroundTaskUpdate({
        ...task,
        progress: 100,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Batch rewrite failed',
      });
      throw error;
    }
  }
}
