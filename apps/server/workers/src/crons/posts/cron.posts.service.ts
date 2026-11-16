import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { resolvePublishProvider } from '@api/services/integrations/publishers/publisher-limits';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import {
  type ScheduledPostSweepLease,
  ScheduledPostSweepLockService,
} from '@workers/crons/posts/scheduled-post-sweep-lock.service';
import {
  SCHEDULED_POST_APPROVAL_MISSING_MESSAGE,
  SCHEDULED_POST_SWEEP_MAX_POSTS,
  SCHEDULED_POST_SWEEP_PAGE_SIZE,
} from '@workers/services/scheduled-post.constants';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import {
  type DuePostCursor,
  ScheduledPostDiscoveryService,
} from '@workers/services/scheduled-post-discovery.service';

interface ApprovalIdentity {
  approvalId: string;
  operationId: string;
  versionPinId: string;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * The version-bound approval a due post may publish under, or null when any of
 * its three identity fields is missing: such a job could only be refused later,
 * at the claim, as an unexpected workflow error.
 */
function readApprovalIdentity(post: PostEntity): ApprovalIdentity | null {
  const approval = post.publishApproval;
  return approval &&
    isNonEmpty(approval.id) &&
    isNonEmpty(approval.operationId) &&
    isNonEmpty(approval.artifactVersionPinId)
    ? {
        approvalId: approval.id,
        operationId: approval.operationId,
        versionPinId: approval.artifactVersionPinId,
      }
    : null;
}

@Injectable()
export class CronPostsService {
  constructor(
    private readonly logger: LoggerService,
    private readonly discoveryService: ScheduledPostDiscoveryService,
    private readonly workflowQueue: ScheduledPostWorkflowQueueService,
    private readonly delivery: ScheduledPostDeliveryService,
    private readonly sweepLock: ScheduledPostSweepLockService,
  ) {}

  /**
   * Discovers due posts and queues one immutable workflow graph per target.
   * Fired every minute by the platform schedule control plane. Reads every due
   * post page by page, up to `SCHEDULED_POST_SWEEP_MAX_POSTS`, so a burst is
   * enqueued in the minute it is due; the queue's own limits pace the publish.
   */
  async publishScheduledPosts(): Promise<void> {
    let lease: ScheduledPostSweepLease | null = null;
    try {
      lease = await this.sweepLock.acquire();
      if (!lease) {
        this.logger.log(
          'CronPostsService sweep skipped: a run is still paging',
        );
        return;
      }
      await this.sweepDuePosts(lease);
    } catch (error: unknown) {
      this.logger.error('CronPostsService scheduled publish sweep failed', {
        error,
      });
    } finally {
      await lease?.release();
    }
  }

  private async sweepDuePosts(lease: ScheduledPostSweepLease): Promise<void> {
    // One `now` for every page, so the due set cannot grow under the cursor.
    const now = new Date();
    let cursor: DuePostCursor | null = null;
    let scanned = 0;

    while (true) {
      const remaining = SCHEDULED_POST_SWEEP_MAX_POSTS - scanned;
      const page = await this.discoveryService.findDuePostsPage({
        cursor,
        limit: Math.min(SCHEDULED_POST_SWEEP_PAGE_SIZE, Math.max(remaining, 1)),
        now,
      });
      if (remaining <= 0) {
        if (page.posts.length > 0) {
          this.logger.warn(
            'CronPostsService sweep reached its cap; the rest are left for the next run',
            { cap: SCHEDULED_POST_SWEEP_MAX_POSTS, scanned },
          );
        }
        break;
      }
      scanned += page.posts.length;
      await Promise.allSettled(page.posts.map((post) => this.queuePost(post)));

      cursor = page.nextCursor;
      if (!cursor) break;
      if (!(await lease.extend())) {
        this.logger.warn('CronPostsService sweep lost its lock; stopping', {
          scanned,
        });
        return;
      }
    }
    this.logger.log('CronPostsService found scheduled posts', {
      total: scanned,
    });
  }

  private async queuePost(post: PostEntity): Promise<void> {
    const organizationId = readPostString(post, ['organizationId']);
    if (!organizationId) {
      this.logger.warn('Scheduled post has no organization', {
        postId: post.id,
      });
      return;
    }
    const identity = readApprovalIdentity(post);
    if (!identity) {
      await this.refuseWithoutApproval(post, organizationId);
      return;
    }
    const userId = readPostString(post, ['userId']);
    try {
      await this.workflowQueue.enqueue(
        {
          ...identity,
          organizationId,
          postId: post.id.toString(),
          source: 'scheduled_sweep',
          ...(userId ? { userId } : {}),
        },
        post.platform
          ? { publishProvider: resolvePublishProvider(post.platform) }
          : {},
      );
    } catch (error: unknown) {
      this.logger.error('Failed to queue scheduled post workflow', {
        error,
        organizationId,
        postId: post.id,
      });
    }
  }

  /**
   * A due post with no approval for its current version is never dispatched.
   * It is read again first, since an approval may have just been issued, and
   * then closed as failed with a message the owner can act on: scheduling it
   * again requests a fresh approval. This is an expected denial, not a workflow
   * error.
   */
  private async refuseWithoutApproval(
    post: PostEntity,
    organizationId: string,
  ): Promise<void> {
    const postId = post.id.toString();
    try {
      const current = await this.discoveryService.findEligiblePost({
        organizationId,
        postId,
      });
      if (!current || readApprovalIdentity(current)) return;
      this.logger.warn('Scheduled post has no approval; not dispatched', {
        organizationId,
        postId,
      });
      await this.delivery.failTerminalValidation(
        current,
        new Error(SCHEDULED_POST_APPROVAL_MISSING_MESSAGE),
      );
    } catch (error: unknown) {
      this.logger.error('Failed to close a scheduled post without approval', {
        error,
        organizationId,
        postId,
      });
    }
  }
}
