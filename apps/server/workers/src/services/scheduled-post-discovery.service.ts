import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { orderedPostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
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

/**
 * Sort keys of the last due post a sweep read. The sweep orders by
 * `(lastAttemptAt nulls first, scheduledDate nulls last, id)`, so the next page
 * starts strictly after these three values.
 */
export type DuePostCursor = {
  id: string;
  lastAttemptAt: Date | null;
  scheduledDate: Date | null;
};

export type DuePostsPage = {
  /** Null when this page was the last one. */
  nextCursor: DuePostCursor | null;
  posts: PostEntity[];
};

const DEFAULT_DUE_POST_LIMIT = 50;

// Never-attempted posts first, then oldest due: with no order the same
// already-queued rows can fill every sweep and starve the rest.
const DUE_POST_ORDER: Prisma.PostOrderByWithRelationInput[] = [
  { lastAttemptAt: { nulls: 'first', sort: 'asc' } },
  { scheduledDate: { nulls: 'last', sort: 'asc' } },
  { id: 'asc' },
];

/**
 * Rows strictly after `cursor` in `DUE_POST_ORDER`, as a plain predicate on the
 * sort keys. A due post stays due until a worker claims it, so the sweep cannot
 * re-read page 1 to move on: it would return the rows it just enqueued.
 */
function afterDuePostCursor(cursor: DuePostCursor): Prisma.PostWhereInput {
  const afterId: Prisma.PostWhereInput = { id: { gt: cursor.id } };

  // `scheduledDate` sorts nulls last.
  const afterScheduledDate: Prisma.PostWhereInput =
    cursor.scheduledDate === null
      ? { AND: [{ scheduledDate: null }, afterId] }
      : {
          OR: [
            { scheduledDate: { gt: cursor.scheduledDate } },
            { scheduledDate: null },
            { AND: [{ scheduledDate: cursor.scheduledDate }, afterId] },
          ],
        };

  // `lastAttemptAt` sorts nulls first.
  return cursor.lastAttemptAt === null
    ? {
        OR: [
          { lastAttemptAt: { not: null } },
          { AND: [{ lastAttemptAt: null }, afterScheduledDate] },
        ],
      }
    : {
        OR: [
          { lastAttemptAt: { gt: cursor.lastAttemptAt } },
          {
            AND: [{ lastAttemptAt: cursor.lastAttemptAt }, afterScheduledDate],
          },
        ],
      };
}

@Injectable()
export class ScheduledPostDiscoveryService {
  constructor(private readonly postsService: PostsService) {}

  async findDuePosts(filter: ScheduledPostFilter = {}): Promise<PostEntity[]> {
    const { posts } = await this.findDuePostsPage({
      ...filter,
      limit: filter.limit ?? DEFAULT_DUE_POST_LIMIT,
    });
    return posts;
  }

  /**
   * One page of due posts after `cursor`, in sweep order. Pass the same `now`
   * for every page of a run so the due set cannot grow under the cursor.
   */
  async findDuePostsPage(
    filter: ScheduledPostFilter & {
      cursor?: DuePostCursor | null;
      limit: number;
      now?: Date;
    },
  ): Promise<DuePostsPage> {
    const now = filter.now ?? new Date();
    const backoffThreshold = new Date(
      now.getTime() - SCHEDULED_POST_RETRY_BACKOFF_SECONDS * 1000,
    );

    const posts = await this.findPosts(
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
          ...(filter.cursor ? [afterDuePostCursor(filter.cursor)] : []),
        ],
        OR: [
          { scheduledDate: { lte: now } },
          { nextScheduledDate: { lte: now } },
        ],
        isDeleted: false,
        parentId: null,
      },
      filter.limit,
    );

    const last = posts.at(-1);
    return {
      nextCursor:
        last && posts.length === filter.limit
          ? {
              id: last.id.toString(),
              lastAttemptAt: last.lastAttemptAt ?? null,
              scheduledDate: last.scheduledDate ?? null,
            }
          : null,
      posts,
    };
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
              ingredientLinks: orderedPostIngredientLinks(),
            },
            where: {
              isDeleted: false,
              ...postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
            },
          },
          ingredientLinks: orderedPostIngredientLinks(),
          publishApproval: {
            select: {
              artifactVersionPinId: true,
              id: true,
              operationId: true,
              status: true,
            },
          },
        },
        orderBy: DUE_POST_ORDER,
        where,
      },
      // No total: a sweep page never needs it, and counting every due post
      // once per page is the cost that grows with the burst.
      { customLabels, limit, pagination: false },
      false,
    );

    return posts.docs as unknown as PostEntity[];
  }
}
