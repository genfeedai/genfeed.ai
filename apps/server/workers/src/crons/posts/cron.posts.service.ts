import { ActivityEntity } from '@server/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { PostEntity } from '@server/collections/posts/entities/post.entity';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { PostPublishJobData } from '@genfeedai/queue-contracts';
import { PublishApprovalsService, type PublishResult } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import type { QueuedPostPublishSkip } from '@workers/crons/posts/post-publish-error.util';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';
import { ScheduledPostQueueService } from '@workers/services/scheduled-post-queue.service';

@Injectable()
export class CronPostsService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly activitiesService: ActivitiesService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly postRepeatSchedulerService: PostRepeatSchedulerService,
    private readonly scheduledPostExecutionGuardService: ScheduledPostExecutionGuardService,
    private readonly scheduledPostQueueService: ScheduledPostQueueService,
    private readonly scheduledPostDeliveryService: ScheduledPostDeliveryService,
  ) {}

  /**
   * Publishes due scheduled posts. Fired every 15 minutes by the
   * system-sweeps BullMQ Job Scheduler (SystemSweepsProcessor).
   */
  async publishScheduledPosts(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const posts = await this.scheduledPostQueueService.findDuePosts();

      this.logger.log(`${url} found ${posts.length} posts`, {
        total: posts.length,
        totalDocs: posts.length,
      });

      if (posts.length === 0) {
        this.logger.log(`${url} no posts to process`);
        return;
      }

      await this.scheduledPostQueueService.enqueueDuePosts(posts);
    } catch (error: unknown) {
      this.logger.error(`${url} error`, { error });
    }
  }

  async processQueuedPost(
    data: PostPublishJobData,
  ): Promise<PublishResult | QueuedPostPublishSkip> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const post = await this.scheduledPostQueueService.findQueuedPost(data);

    if (!post) {
      this.logger.log(`${url} skipped stale post publish job`, {
        organizationId: data.organizationId,
        postId: data.postId,
        source: data.source,
      });
      return { reason: 'not_eligible', skipped: true };
    }

    return this.publishPostWithSideEffects(post, data);
  }

  private async publishPostWithSideEffects(
    post: PostEntity,
    job: PostPublishJobData,
  ): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const { approvalId, operationId, versionPinId } = job;
    if (!approvalId || !operationId || !versionPinId) {
      return this.handleTerminalPublishValidationFailure(
        post,
        new Error(
          'Publish execution requires an explicit version-bound approval identity.',
        ),
      );
    }

    let executionStartedAt = '';
    try {
      await this.scheduledPostExecutionGuardService.assertAgentPublishingScope(
        post,
      );
      const claim = await this.publishApprovalsService.claimForExecution({
        approvalId,
        operationId,
        organizationId: job.organizationId,
        postId: job.postId,
        versionPinId,
      });
      if (claim.isAlreadyPublished) {
        await this.postRepeatSchedulerService.materializeRecurrence(post);
        return {
          externalId: readPostString(post, ['externalId']) ?? null,
          executionState: TargetExecutionState.PUBLISHED,
          platform: post.platform ?? '',
          success: true,
          url: readPostString(post, ['url']) ?? '',
        };
      }
      if (!claim.executionStartedAt) {
        throw new Error('Publish execution claim did not return a lease.');
      }
      executionStartedAt = claim.executionStartedAt;
      await this.scheduledPostExecutionGuardService.assertPublishVersionPin(
        post,
        versionPinId,
      );
    } catch (error: unknown) {
      if (executionStartedAt) {
        const errorMessage =
          error instanceof Error ? error.message : 'Publish validation failed';
        try {
          await this.publishApprovalsService.completeExecution({
            approvalId,
            error: errorMessage,
            executionStartedAt,
            isSuccessful: false,
            operationId,
            organizationId: job.organizationId,
            versionPinId,
          });
        } catch (completionError: unknown) {
          this.logger.error(
            'Failed to release publish approval after validation rejection',
            {
              approvalId,
              error:
                completionError instanceof Error
                  ? completionError.message
                  : 'Unknown publish completion error',
              postId: post.id,
            },
          );
        }
      }
      return this.handleTerminalPublishValidationFailure(post, error);
    }
    const result = await this.publishSinglePost(post, job.source);

    await this.publishApprovalsService.completeExecution({
      approvalId,
      ...(result.error ? { error: result.error } : {}),
      executionStartedAt,
      isSuccessful: result.success,
      operationId,
      organizationId: job.organizationId,
      versionPinId,
    });

    if (result.success && !result.isProviderDraft) {
      await this.activitiesService.create(
        new ActivityEntity({
          brandId: readPostString(post, ['brandId']) ?? undefined,
          entityId: post.id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_PUBLISHED,
          organizationId: readPostString(post, ['organizationId']) ?? undefined,
          source: ActivitySource.POST,
          userId: readPostString(post, ['userId']) ?? undefined,
          value: `Published to ${result.platform}: ${result.url}`,
        }),
      );

      await this.postRepeatSchedulerService.scheduleNextRepeat(post, url);
    }

    return result;
  }

  private async publishSinglePost(
    post: PostEntity,
    source: PostPublishJobData['source'],
  ): Promise<PublishResult> {
    return this.scheduledPostDeliveryService.publishSinglePost(post, source);
  }

  private async handleTerminalPublishValidationFailure(
    post: PostEntity,
    error: unknown,
  ): Promise<PublishResult> {
    return this.scheduledPostDeliveryService.failTerminalValidation(
      post,
      error,
    );
  }
}
