import type { PostDocument } from '@api/collections/posts/post.schema';
import { bindScheduledPublishApproval } from '@api/collections/posts/services/post-schedule-approval.util';
import type { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { scopedWhere } from '@api/index';
import type { CacheService } from '@api/services/cache/cache.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TimezoneUtil } from '@api/shared/utils/timezone/timezone.util';
import { PostCategory, TargetExecutionState } from '@genfeedai/enums';
import type { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

export interface PostBatchScheduleItem {
  ingredientIds?: string[];
  postId: string;
  scheduledDate: string;
  text: string;
  timezone?: string;
}

export interface PostBatchScheduleTarget {
  credentialId: string;
  platform: string;
}

export interface PostBatchScheduleResult {
  missingPostIds: string[];
  posts: PostDocument[];
}

/**
 * The `PostsService` collaborators the batch needs. Passed explicitly rather
 * than reached through `this` so the write planning stays outside the service
 * file, which is at its runtime-complexity ceiling.
 */
export interface PostBatchScheduleContext {
  actorUserId: string;
  cacheService?: Pick<CacheService, 'invalidateByTags'>;
  cacheTags: readonly string[];
  logger: Pick<LoggerService, 'log'>;
  normalizeData: (data: unknown) => Record<string, unknown>;
  normalizeDocument: (document: unknown) => PostDocument;
  scheduledPostWorkflowQueue?: Pick<
    ScheduledPostWorkflowQueueService,
    'enqueue'
  >;
  prisma: PrismaService;
  publishApprovalsService?: Pick<
    PublishApprovalsService,
    'assertPostMutable' | 'createForCurrentPost'
  >;
}

type ExistingPost = {
  id: string;
  parentId: string | null;
  publishApprovalId: string | null;
};

/**
 * Plan every write for the batch in statement order.
 *
 * Order mirrors the old per-post loop (a root post's child cascade is queued
 * immediately before its own update) so an in-batch child still wins over its
 * parent's cascade. `updateIndexes` records where each post's own update sits
 * so the transaction results can be mapped back to documents.
 */
function planBatchWrites(
  context: PostBatchScheduleContext,
  items: readonly PostBatchScheduleItem[],
  existingById: Map<string, ExistingPost>,
  organizationId: string,
  target: PostBatchScheduleTarget,
): { updateIndexes: number[]; writes: Prisma.PrismaPromise<unknown>[] } {
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  const updateIndexes: number[] = [];

  for (const item of items) {
    const postId = String(item.postId);
    const existing = existingById.get(postId);

    if (!existing) {
      continue;
    }

    const scheduledDate = item.timezone
      ? TimezoneUtil.convertToUTC(new Date(item.scheduledDate), item.timezone)
      : new Date(item.scheduledDate);

    const ingredientIds =
      EntityIdUtil.normalizeIds(item.ingredientIds ?? []) ?? [];

    // Scheduling a root post cascades to its children, exactly as `patch`
    // does — and, as there, before the post's own update is applied.
    if (!existing.parentId) {
      const cascadeData: Prisma.PostUncheckedUpdateManyInput = {
        credentialId: target.credentialId,
        platform: target.platform,
        scheduledDate,
        targetExecutionState: TargetExecutionState.SCHEDULED,
      };

      writes.push(
        context.prisma.post.updateMany({
          data: cascadeData,
          where: scopedWhere(organizationId, {
            parentId: postId,
            targetExecutionState: { not: TargetExecutionState.PUBLISHED },
          }),
        }),
      );
    }

    // `category` is a real Prisma enum, so the payload still has to go
    // through `normalizeData`. Post status values are canonical lowercase
    // strings everywhere in the persistence layer.
    const data = context.normalizeData({
      ...(ingredientIds.length > 0 && { category: PostCategory.IMAGE }),
      credentialId: target.credentialId,
      description: item.text,
      platform: target.platform,
      scheduledDate,
      targetExecutionState: TargetExecutionState.SCHEDULED,
      ...(item.timezone !== undefined && { timezone: item.timezone }),
    });

    updateIndexes.push(writes.length);
    writes.push(
      context.prisma.post.update({
        data: {
          ...data,
          // `ingredients` is a many-to-many relation: a bare string[] is not
          // a valid Prisma payload, it needs the nested-write envelope.
          ingredients: { set: ingredientIds.map((id) => ({ id })) },
        } as Prisma.PostUpdateInput,
        include: { credential: true, ingredients: true },
        where: scopedWhere(organizationId, { id: postId }),
      }),
    );
  }

  return { updateIndexes, writes };
}

/**
 * Schedule a batch of posts in a fixed number of round-trips.
 *
 * `patch` costs 2–4 sequential queries per post (approval context, mutability
 * assertion, current-post read, the update itself, the child cascade), so
 * scheduling N posts through it was 2N–4N serial round-trips driven by a
 * caller-supplied array. This collapses to one scoped existence read, one
 * mutability assertion per approval-guarded post (concurrent, read-only), a
 * single `$transaction` carrying every write, and one cache invalidation.
 *
 * Scoping, status transitions, timezone conversion, the child cascade and the
 * version-bound approval mint all match `create`/`patch` — only the number of
 * round-trips changes.
 */
export async function batchSchedulePosts(
  context: PostBatchScheduleContext,
  items: readonly PostBatchScheduleItem[],
  organizationId: string,
  target: PostBatchScheduleTarget,
): Promise<PostBatchScheduleResult> {
  if (items.length === 0) {
    return { missingPostIds: [], posts: [] };
  }

  const requestedIds = [...new Set(items.map((item) => String(item.postId)))];

  const existingPosts = await context.prisma.post.findMany({
    select: { id: true, parentId: true, publishApprovalId: true },
    where: scopedWhere(organizationId, { id: { in: requestedIds } }),
  });
  const existingById = new Map<string, ExistingPost>(
    existingPosts.map((post: ExistingPost) => [post.id, post]),
  );
  const missingPostIds = requestedIds.filter((id) => !existingById.has(id));

  // Mutability is a read-only guard, so it runs concurrently ahead of the
  // transaction rather than once per post inside the write loop.
  const approvalGuardedIds = existingPosts
    .filter((post: ExistingPost) => Boolean(post.publishApprovalId))
    .map((post: ExistingPost) => post.id);

  const approvalsService = context.publishApprovalsService;
  if (approvalsService && approvalGuardedIds.length > 0) {
    await Promise.all(
      approvalGuardedIds.map((id: string) =>
        approvalsService.assertPostMutable(organizationId, id),
      ),
    );
  }

  const { updateIndexes, writes } = planBatchWrites(
    context,
    items,
    existingById,
    organizationId,
    target,
  );

  if (writes.length === 0) {
    return { missingPostIds, posts: [] };
  }

  const results = await context.prisma.$transaction(writes);

  if (context.cacheService) {
    await context.cacheService.invalidateByTags([...context.cacheTags]);
  }

  const posts = updateIndexes.map((index) =>
    context.normalizeDocument(results[index]),
  );
  await Promise.all(
    posts.map((post) =>
      bindScheduledPublishApproval({
        actorUserId: context.actorUserId,
        post,
        scheduledPostWorkflowQueue: context.scheduledPostWorkflowQueue,
        provenanceSurface: 'posts-batch-schedule',
        publishApprovalsService: context.publishApprovalsService,
      }),
    ),
  );

  context.logger.log('Batch scheduled posts', {
    missing: missingPostIds.length,
    organizationId,
    requested: requestedIds.length,
    updated: updateIndexes.length,
  });

  return {
    missingPostIds,
    posts,
  };
}
