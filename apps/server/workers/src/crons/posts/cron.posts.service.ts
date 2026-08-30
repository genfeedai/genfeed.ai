import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type { PostEntity } from '@server/collections/posts/entities/post.entity';
import { ScheduledPostWorkflowQueueService } from '@server/collections/posts/services/scheduled-post-workflow-queue.service';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { ScheduledPostDiscoveryService } from '@workers/services/scheduled-post-discovery.service';

@Injectable()
export class CronPostsService {
  constructor(
    private readonly logger: LoggerService,
    private readonly discoveryService: ScheduledPostDiscoveryService,
    private readonly workflowQueue: ScheduledPostWorkflowQueueService,
  ) {}

  /**
   * Discovers due posts and queues one immutable workflow graph per target.
   * Fired every 15 minutes by the system-sweeps BullMQ Job Scheduler.
   */
  async publishScheduledPosts(): Promise<void> {
    try {
      const posts = await this.discoveryService.findDuePosts();
      this.logger.log('CronPostsService found scheduled posts', {
        total: posts.length,
      });
      await Promise.allSettled(posts.map((post) => this.queuePost(post)));
    } catch (error: unknown) {
      this.logger.error('CronPostsService scheduled publish sweep failed', {
        error,
      });
    }
  }

  private async queuePost(post: PostEntity): Promise<void> {
    const organizationId = readPostString(post, ['organizationId']);
    if (!organizationId) {
      this.logger.warn('Scheduled post has no organization', {
        postId: post.id,
      });
      return;
    }
    const approval = this.readRecord(post.publishApproval);
    const userId = readPostString(post, ['userId']);
    try {
      await this.workflowQueue.enqueue({
        ...(typeof approval.id === 'string' ? { approvalId: approval.id } : {}),
        ...(typeof approval.operationId === 'string'
          ? { operationId: approval.operationId }
          : {}),
        organizationId,
        postId: post.id.toString(),
        source: 'scheduled_sweep',
        ...(userId ? { userId } : {}),
        ...(typeof approval.artifactVersionPinId === 'string'
          ? { versionPinId: approval.artifactVersionPinId }
          : {}),
      });
    } catch (error: unknown) {
      this.logger.error('Failed to queue scheduled post workflow', {
        error,
        organizationId,
        postId: post.id,
      });
    }
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
