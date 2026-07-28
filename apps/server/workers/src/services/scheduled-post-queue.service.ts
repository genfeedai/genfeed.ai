import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { PostStatus } from '@genfeedai/enums';
import type { PostPublishJobData } from '@genfeedai/queue-contracts';
import {
  PostPublishQueueService,
  PublishApprovalsService,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';
import { readPostString } from '@workers/services/scheduled-post.utils';

export type ScheduledPostFilter = {
  limit?: number;
  organizationId?: string;
  postId?: string;
};

@Injectable()
export class ScheduledPostQueueService {
  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly postPublishQueueService: PostPublishQueueService,
    private readonly publishApprovalsService: PublishApprovalsService,
  ) {}

  async enqueueDuePosts(posts: PostEntity[]): Promise<void> {
    await Promise.allSettled(
      posts.map(async (post) => {
        const organizationId = readPostString(post, [
          'organization',
          'organizationId',
        ]);
        if (!organizationId) {
          this.logger.warn(
            'ScheduledPostQueueService missing organization for post publish job',
            { postId: post.id },
          );
          return;
        }

        const approval = post.publishApproval;
        let approvalMarkedQueued = false;
        try {
          if (approval) {
            await this.publishApprovalsService.markQueued(
              approval.id,
              organizationId,
            );
            approvalMarkedQueued = true;
          }
          await this.postPublishQueueService.enqueue({
            ...(approval
              ? {
                  approvalId: approval.id,
                  operationId: approval.operationId,
                  versionPinId: approval.artifactVersionPinId,
                }
              : post.reviewVersionPinId
                ? { versionPinId: post.reviewVersionPinId }
                : {}),
            organizationId,
            postId: post.id.toString(),
            source: 'scheduled_sweep',
          });
        } catch (error: unknown) {
          if (approval && approvalMarkedQueued) {
            try {
              await this.publishApprovalsService.markEnqueueFailed(
                approval.id,
                organizationId,
                error instanceof Error
                  ? error.message
                  : 'Scheduled publish enqueue failed.',
              );
            } catch (compensationError: unknown) {
              this.logger.error(
                'ScheduledPostQueueService failed to compensate queued approval',
                {
                  approvalId: approval.id,
                  error: compensationError,
                  postId: post.id,
                },
              );
            }
          }
          this.logger.error(
            'ScheduledPostQueueService failed to queue scheduled post',
            { error, postId: post.id },
          );
        }
      }),
    );
  }

  async findDuePosts(filter: ScheduledPostFilter = {}): Promise<PostEntity[]> {
    const now = new Date();
    const backoffThreshold = new Date(
      now.getTime() - SCHEDULED_POST_RETRY_BACKOFF_SECONDS * 1000,
    );

    const posts = await this.postsService.findAll(
      {
        include: {
          children: {
            include: {
              credential: true,
              ingredients: true,
            },
            where: {
              isDeleted: false,
              status: PostStatus.SCHEDULED,
            },
          },
          ingredients: true,
          publishApproval: {
            select: {
              artifactVersionPinId: true,
              id: true,
              operationId: true,
            },
          },
        },
        where: {
          ...(filter.postId ? { id: filter.postId } : {}),
          ...(filter.organizationId
            ? { organizationId: filter.organizationId }
            : {}),
          AND: [
            {
              OR: [
                { lastAttemptAt: null },
                { lastAttemptAt: { lte: backoffThreshold } },
              ],
            },
          ],
          OR: [
            { scheduledDate: { lte: now } },
            { nextScheduledDate: { lte: now } },
          ],
          isDeleted: false,
          parentId: null,
          status: { in: [PostStatus.SCHEDULED, PostStatus.PROCESSING] },
        },
      },
      {
        customLabels,
        limit: filter.limit ?? 50,
        page: 1,
      },
    );

    return posts.docs as unknown as PostEntity[];
  }

  async findQueuedPost(data: PostPublishJobData): Promise<PostEntity | null> {
    const posts = await this.postsService.findAll(
      {
        include: {
          children: {
            include: {
              credential: true,
              ingredients: true,
            },
            where: {
              isDeleted: false,
              status: PostStatus.SCHEDULED,
            },
          },
          ingredients: true,
          publishApproval: {
            select: {
              artifactVersionPinId: true,
              id: true,
              operationId: true,
            },
          },
        },
        where: {
          id: data.postId,
          isDeleted: false,
          organizationId: data.organizationId,
          parentId: null,
          status: { in: [PostStatus.SCHEDULED, PostStatus.PROCESSING] },
        },
      },
      {
        customLabels,
        limit: 1,
        page: 1,
      },
    );

    return (posts.docs[0] as unknown as PostEntity | undefined) ?? null;
  }
}
