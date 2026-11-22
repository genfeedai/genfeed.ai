import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  flattenPostIngredients,
  orderedPostIngredientLinks,
} from '@api/collections/posts/services/post-ingredient-links.util';
import {
  type CredentialDocument,
  type PublisherPostInput,
  SERVER_TOKENS,
  type ServerCredentialStore,
  type ServerPublisherFactory,
  scopedWhere,
} from '@api/index';
import {
  fromPrismaCredentialPlatform,
  type PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  getChannelThreadChildCapability,
  postExecutionStateReadFilter,
  resolveChannelTargetSettings,
} from '@genfeedai/contracts/api-types/contracts';
import { resolvePostVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { type Post, toPrismaJson } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Inject, Injectable } from '@nestjs/common';
import { createChannelTargetError } from '@workers/crons/posts/post-publish-error.util';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';
import {
  type ScheduledPostSweepLease,
  ScheduledPostSweepLockService,
  THREAD_COMMENT_SWEEP_LOCK_KEY,
} from '@workers/services/scheduled-post-sweep-lock.service';

type ThreadCommentParent = Post & {
  ingredients?: Array<{ id: string }>;
};

type ThreadCommentChild = Post & {
  ingredients?: Array<{ id: string }>;
};

const MAX_DUE_COMMENTS_PER_SWEEP = 100;
const MAX_COMMENT_ATTEMPTS = 3;

/**
 * Publishes the comments a creator parked behind a post.
 *
 * The publish worker sends the follow-ups that go out with the parent and
 * leaves the delayed ones SCHEDULED with a due date. This sweep picks those up
 * once they come due and hands each one to the same publisher, anchored to the
 * parent's provider id — or, on a reply-chain channel, to the last sibling
 * that made it out, so a delay never breaks the chain.
 */
@Injectable()
export class ThreadCommentDeliveryService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    @Inject(SERVER_TOKENS.publisherFactory)
    private readonly publisherFactory: ServerPublisherFactory,
    private readonly sweepLock: ScheduledPostSweepLockService,
  ) {}

  async publishDueThreadComments(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let lease: ScheduledPostSweepLease | null = null;

    try {
      // The sweep reads a list and then works through it for as long as the
      // providers take. Without the lock, a slow run is re-read by the next
      // tick (or by the second task of a rolling deploy) while it is still
      // going.
      lease = await this.sweepLock.acquire(THREAD_COMMENT_SWEEP_LOCK_KEY);
      if (!lease) {
        this.logger.log(`${url} sweep skipped: a run is still going`);
        return;
      }
      await this.sweepDueComments(lease, url);
    } catch (error: unknown) {
      this.logger.error(`${url} sweep failed`, {
        error: getErrorMessage(error, { fallback: () => 'Unknown error' }),
      });
    } finally {
      await lease?.release();
    }
  }

  private async sweepDueComments(
    lease: ScheduledPostSweepLease,
    url: string,
  ): Promise<void> {
    const now = new Date();
    const backoffThreshold = this.backoffThresholdFor(now);

    const dueChildren = await this.findDueChildren(now, backoffThreshold);
    if (dueChildren.length === 0) {
      return;
    }

    const byParent = new Map<string, ThreadCommentChild[]>();
    for (const child of dueChildren) {
      if (!child.parentId) {
        continue;
      }
      const siblings = byParent.get(child.parentId) ?? [];
      siblings.push(child);
      byParent.set(child.parentId, siblings);
    }

    this.logger.log(`${url} found due comments`, {
      parentCount: byParent.size,
      total: dueChildren.length,
    });

    for (const [parentId, children] of byParent) {
      if (!(await lease.extend())) {
        this.logger.warn(`${url} sweep lost its lock; stopping`);
        return;
      }
      await this.publishParentComments(
        parentId,
        children,
        url,
        backoffThreshold,
      );
    }
  }

  private backoffThresholdFor(now: Date): Date {
    return new Date(
      now.getTime() - SCHEDULED_POST_RETRY_BACKOFF_SECONDS * 1000,
    );
  }

  private async findDueChildren(
    now: Date,
    backoffThreshold: Date,
  ): Promise<ThreadCommentChild[]> {
    const children = await this.prisma.post.findMany({
      include: {
        ingredientLinks: orderedPostIngredientLinks({ select: { id: true } }),
      },
      orderBy: [{ parentId: 'asc' }, { order: 'asc' }],
      take: MAX_DUE_COMMENTS_PER_SWEEP,
      where: {
        AND: [
          postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
          {
            OR: [
              { lastAttemptAt: null },
              { lastAttemptAt: { lte: backoffThreshold } },
            ],
          },
        ],
        isDeleted: false,
        // Only comments a creator actually delayed. The ones that go out with
        // the parent are published inline by the publish worker.
        parent: {
          is: {
            externalId: { not: null },
            isDeleted: false,
            ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
          },
        },
        parentId: { not: null },
        scheduledDate: { lte: now },
        threadDelayMinutes: { gt: 0 },
      },
    });

    return children.map((child) =>
      flattenPostIngredients(child),
    ) as unknown as ThreadCommentChild[];
  }

  private async publishParentComments(
    parentId: string,
    children: ThreadCommentChild[],
    url: string,
    backoffThreshold: Date,
  ): Promise<void> {
    const loadedParent = await this.prisma.post.findFirst({
      include: {
        ingredientLinks: orderedPostIngredientLinks({ select: { id: true } }),
      },
      where: { id: parentId, isDeleted: false },
    });
    const parent = (
      loadedParent ? flattenPostIngredients(loadedParent) : null
    ) as ThreadCommentParent | null;

    if (!parent?.externalId) {
      this.logger.warn(`${url} parent is not published yet`, { parentId });
      return;
    }

    // A breakout thread was admitted, scored and published as one unit with its segments.
    // Its parent is already PUBLISHED, so a delayed comment cannot be re-admitted: never
    // send one.
    if (parent.breakoutOutputId) {
      await this.failChildren(
        children,
        'Breakout thread comments publish with their parent and cannot be delayed',
        url,
      );
      return;
    }

    const platform = fromPrismaCredentialPlatform(
      String(parent.platform ?? ''),
    );
    if (!platform) {
      await this.failChildren(children, 'Unsupported platform', url);
      return;
    }

    const publisher = this.publisherFactory.getPublisher(platform);
    if (!publisher?.supportsThreads || !publisher.publishThreadChildren) {
      await this.failChildren(
        children,
        `${platform} cannot publish comments`,
        url,
      );
      return;
    }

    if (!parent.credentialId) {
      await this.failChildren(children, 'Parent post has no channel', url);
      return;
    }

    const [credentialRecord, organizationRecord] = await Promise.all([
      this.credentialsService.findOne({
        id: parent.credentialId,
        isDeleted: false,
        organizationId: parent.organizationId,
      }),
      this.organizationsService.findOne({
        id: parent.organizationId,
        isDeleted: false,
      }),
    ]);
    const credential = credentialRecord as CredentialDocument | null;
    const organization = organizationRecord as OrganizationDocument | null;

    if (!credential || !organization) {
      this.logger.error(`${url} missing credential or organization`, {
        parentId,
      });
      return;
    }

    const context = {
      brandId: parent.brandId,
      credential,
      organization,
      organizationId: parent.organizationId,
      post: this.toPublisherPost(parent),
      postId: parent.id,
      settings: resolveChannelTargetSettings(platform, parent.targetSettings),
      visibility: resolvePostVisibility(parent.visibility),
    };

    const isReplyChain =
      getChannelThreadChildCapability(platform).kind === 'reply_chain';

    for (const child of children) {
      if (await this.hasUnfinishedEarlierSibling(parent.id, child)) {
        this.logger.log(`${url} waiting on an earlier comment`, {
          childPostId: child.id,
          parentId,
        });
        continue;
      }

      const anchorExternalId = isReplyChain
        ? ((await this.findLastPublishedSiblingExternalId(parent.id, child)) ??
          parent.externalId)
        : parent.externalId;

      // The stamp is the claim: it only matches a child that is still
      // SCHEDULED, not deleted and not attempted inside the backoff window, so
      // of two workers holding the same list only one gets count 1.
      const claim = await this.prisma.post.updateMany({
        data: { lastAttemptAt: new Date(), retryCount: { increment: 1 } },
        where: scopedWhere(parent.organizationId, {
          AND: [
            postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
            {
              OR: [
                { lastAttemptAt: null },
                { lastAttemptAt: { lte: backoffThreshold } },
              ],
            },
          ],
          id: child.id,
        }),
      });
      if (claim.count !== 1) {
        // Another worker has it, or it was deleted or unscheduled after the
        // list was read. A later reply must not go out ahead of this one, so
        // the thread stops here for this tick.
        this.logger.log(`${url} comment not claimed; skipping thread`, {
          childPostId: child.id,
          parentId,
        });
        return;
      }

      try {
        await publisher.publishThreadChildren(
          context,
          [child as unknown as PostDocument],
          anchorExternalId,
        );
      } catch (error: unknown) {
        const message = getErrorMessage(error, {
          fallback: () => 'Comment publish failed',
        });
        this.logger.error(`${url} comment publish failed`, {
          childPostId: child.id,
          error: message,
          parentId,
        });

        // The publisher marks a child FAILED when the provider rejects it.
        // A throw here means the attempt never got that far, so the comment
        // stays SCHEDULED for the next sweep until it runs out of attempts.
        if ((child.retryCount ?? 0) + 1 >= MAX_COMMENT_ATTEMPTS) {
          await this.failChildren([child], message, url);
        }
        return;
      }
    }
  }

  /**
   * A comment never overtakes the one before it: an earlier sibling still
   * waiting for its own delay holds this one back.
   */
  private async hasUnfinishedEarlierSibling(
    parentId: string,
    child: ThreadCommentChild,
  ): Promise<boolean> {
    const earlier = await this.prisma.post.count({
      where: {
        ...postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
        isDeleted: false,
        order: { lt: child.order },
        parentId,
      },
    });

    return earlier > 0;
  }

  private async findLastPublishedSiblingExternalId(
    parentId: string,
    child: ThreadCommentChild,
  ): Promise<string | null> {
    const sibling = await this.prisma.post.findFirst({
      orderBy: { order: 'desc' },
      select: { externalId: true },
      where: {
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        externalId: { not: null },
        isDeleted: false,
        order: { lt: child.order },
        parentId,
      },
    });

    return sibling?.externalId ?? null;
  }

  private async failChildren(
    children: ThreadCommentChild[],
    reason: string,
    url: string,
  ): Promise<void> {
    this.logger.error(`${url} failing comments`, {
      childCount: children.length,
      reason,
    });

    for (const child of children) {
      await this.prisma.post.updateMany({
        data: {
          targetError: toPrismaJson(
            createChannelTargetError('thread_comment_failed', reason, false),
          ),
          targetExecutionState: TargetExecutionState.FAILED,
        },
        where: scopedWhere(child.organizationId, { id: child.id }),
      });
    }
  }

  private toPublisherPost(parent: ThreadCommentParent): PublisherPostInput {
    return {
      category: parent.category as PostCategory,
      description: parent.description,
      id: parent.id,
      ingredients: (parent.ingredients ?? []).map((ingredient) => ({
        id: ingredient.id,
      })),
      label: parent.label ?? '',
      scheduledDate:
        parent.publishedAt ??
        parent.scheduledDate ??
        new Date(parent.createdAt),
      visibility: resolvePostVisibility(parent.visibility),
    };
  }
}
