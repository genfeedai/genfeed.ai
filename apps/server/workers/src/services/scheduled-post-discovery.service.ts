import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';
import { campaignDispatchAllowedFilter } from '@workers/services/campaign-dispatch.filter';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';

export type ScheduledPostFilter = {
  limit?: number;
  organizationId?: string;
  postId?: string;
};

@Injectable()
export class ScheduledPostDiscoveryService {
  constructor(private readonly postsService: PostsService) {}

  async findDuePosts(filter: ScheduledPostFilter = {}): Promise<PostEntity[]> {
    const now = new Date();
    const backoffThreshold = new Date(
      now.getTime() - SCHEDULED_POST_RETRY_BACKOFF_SECONDS * 1000,
    );

    return this.findPosts(
      {
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
          postExecutionStateReadFilter([
            TargetExecutionState.SCHEDULED,
            TargetExecutionState.PUBLISHING,
          ]),
          campaignDispatchAllowedFilter(),
        ],
        OR: [
          { scheduledDate: { lte: now } },
          { nextScheduledDate: { lte: now } },
        ],
        isDeleted: false,
        parentId: null,
      },
      filter.limit ?? 50,
    );
  }

  async findEligiblePost(input: {
    organizationId: string;
    postId: string;
  }): Promise<PostEntity | null> {
    const posts = await this.findPosts(
      {
        id: input.postId,
        isDeleted: false,
        organizationId: input.organizationId,
        parentId: null,
        ...postExecutionStateReadFilter([
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
        ]),
        AND: [campaignDispatchAllowedFilter()],
      },
      1,
    );
    return posts[0] ?? null;
  }

  async findPost(input: {
    organizationId: string;
    postId: string;
  }): Promise<PostEntity | null> {
    const posts = await this.findPosts(
      {
        id: input.postId,
        isDeleted: false,
        organizationId: input.organizationId,
        parentId: null,
      },
      1,
    );
    return posts[0] ?? null;
  }

  private async findPosts(
    where: Prisma.PostWhereInput,
    limit: number,
  ): Promise<PostEntity[]> {
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
              ...postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
            },
          },
          ingredients: true,
          publishApproval: {
            select: {
              artifactVersionPinId: true,
              id: true,
              operationId: true,
              status: true,
            },
          },
        },
        where,
      },
      { customLabels, limit, page: 1 },
    );

    return posts.docs as unknown as PostEntity[];
  }
}
