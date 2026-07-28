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

export const SCHEDULED_POST_RETRY_BACKOFF_SECONDS = 60;

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
    await Promise.all(
      posts.map(async (post) => {
        const organizationId = this.readPostString(post, [
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
        if (approval) {
          await this.publishApprovalsService.markQueued(
            approval.id,
            organizationId,
          );
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
    const posts = await this.findDuePosts({
      limit: 1,
      organizationId: data.organizationId,
      postId: data.postId,
    });

    return posts[0] ?? null;
  }

  private readPostString(
    post: PostEntity,
    keys: readonly string[],
  ): string | undefined {
    const record = post as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
      if (value && typeof value === 'object' && 'id' in value) {
        const id = (value as { id?: unknown }).id;
        if (typeof id === 'string' && id.length > 0) {
          return id;
        }
      }
    }

    return undefined;
  }
}
