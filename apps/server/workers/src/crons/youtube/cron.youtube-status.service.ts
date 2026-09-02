import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowProvenance,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import {
  CredentialPlatform,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  buildYoutubeStatusReconcileDefinition,
  buildYoutubeStatusSweepDefinition,
  YOUTUBE_MAINTENANCE_ACTION_IDS,
} from '@workers/crons/youtube/youtube-maintenance-workflow-definition';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

const YOUTUBE_PRIVACY_STATUS_MAP: Record<string, PostVisibility> = {
  private: PostVisibility.PRIVATE,
  public: PostVisibility.PUBLIC,
  unlisted: PostVisibility.UNLISTED,
};

const YOUTUBE_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';

@Injectable()
export class CronYoutubeStatusService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly youtubeService: YoutubeService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_POSTS,
      async ({ input }) => {
        const request = input.request as { now?: unknown };
        const now = new Date(String(request.now ?? ''));
        if (!Number.isFinite(now.getTime())) {
          throw new Error('YouTube status sweep requires a valid timestamp');
        }
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const posts = (await this.postsService.findAll(
          {
            include: { credential: true },
            where: {
              createdAt: { gte: sevenDaysAgo },
              externalId: { not: null },
              isDeleted: false,
              platform: CredentialPlatform.YOUTUBE,
              OR: [
                {
                  visibility: {
                    in: [PostVisibility.PRIVATE, PostVisibility.UNLISTED],
                  },
                },
                {
                  visibility: null,
                  status: { in: [PostStatus.PRIVATE, PostStatus.UNLISTED] },
                },
                { targetExecutionState: TargetExecutionState.PUBLISHING },
              ],
            },
          },
          { customLabels, limit: 100 },
        )) as unknown as { docs?: PostEntity[] };
        return {
          items: (posts.docs ?? []).map((post) => ({
            organizationId: post.organizationId,
            postId: String(post.id),
          })),
        };
      },
    );
    this.systemWorkflowRunner.registerAction(
      YOUTUBE_MAINTENANCE_ACTION_IDS.RECONCILE_STATUS,
      ({ input, provenance }) =>
        this.executeStatusReconciliation(
          input.request as Record<string, unknown>,
          provenance,
        ),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildYoutubeStatusSweepDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildYoutubeStatusReconcileDefinition(),
    );
  }

  /**
   * Checks status of non-public YouTube videos and syncs database status
   * with the actual YouTube video status. Stops checking once a video
   * becomes PUBLIC (final state). Fired daily at 1am UTC by the
   * platform BullMQ schedule.
   */
  async checkScheduledYoutubeVideos() {
    const now = new Date();
    const definition = buildYoutubeStatusSweepDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: { now: now.toISOString() } },
        metadata: { platform: CredentialPlatform.YOUTUBE },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'youtube_status_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `youtube-status-sweep-${Math.floor(now.getTime() / YOUTUBE_SWEEP_INTERVAL_MS)}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  /**
   * Check individual post status against YouTube API.
   *
   * Reads scalar FKs (`credentialId`, `organizationId`, `brandId`, `userId`):
   * the Mongo-era relation aliases are undefined unless the query populated
   * the relations, so the credential guard below rejected every post — the
   * status sync never ran — and the provenance record written further down was
   * scoped to the literal string "undefined".
   */
  private async checkPostStatus(
    post: PostEntity,
    provenance: SystemWorkflowProvenance,
  ): Promise<void> {
    const url = `${this.constructorName} checkPostStatus`;

    try {
      if (!post.credentialId) {
        this.logger.warn(`${url} post ${post.id} has no credential`);
        return;
      }

      // Call YouTube API to get actual video status
      const videoStatus = await this.youtubeService.getVideoStatus(
        post.organizationId,
        post.brandId,
        post.externalId,
      );

      this.logger.log(`${url} post ${post.id} video ${post.externalId}`, {
        privacyStatus: videoStatus.privacyStatus,
        publishAt: videoStatus.publishAt,
      });

      // Sync database status with YouTube's actual status
      const targetStatus =
        YOUTUBE_PRIVACY_STATUS_MAP[videoStatus.privacyStatus] ?? null;

      // Update if status doesn't match
      if (
        targetStatus &&
        (post.visibility !== targetStatus ||
          post.targetExecutionState !== TargetExecutionState.PUBLISHED)
      ) {
        const transitioned = await this.applyStatusTransition(
          post,
          targetStatus,
          `YouTube reports ${videoStatus.privacyStatus} - syncing post from ${post.status} to ${targetStatus}`,
          videoStatus.privacyStatus,
          provenance,
        );
        if (
          transitioned &&
          Object.values(PostVisibility).includes(targetStatus)
        ) {
          void this.publishEventWebhookService.emitLegacyPostPublished({
            externalProviderId: post.externalId,
            platform: CredentialPlatform.YOUTUBE,
            post,
            url: `https://www.youtube.com/watch?v=${post.externalId}`,
          });
        }

        this.logger.log(
          `${url} YouTube video ${post.externalId} status synced`,
          {
            newStatus: targetStatus,
            postId: post.id,
            previousVisibility: post.visibility,
            youtubePrivacyStatus: videoStatus.privacyStatus,
          },
        );
      }

      // Special check for scheduled videos that haven't published
      if (
        videoStatus.privacyStatus === 'private' &&
        post.scheduledDate &&
        videoStatus.publishAt
      ) {
        const scheduledDate = new Date(post.scheduledDate);
        const now = new Date();
        const timeSinceScheduled = now.getTime() - scheduledDate.getTime();

        // If more than 1 hour past scheduled time and still private, log warning
        if (timeSinceScheduled > 60 * 60 * 1000) {
          this.logger.warn(
            `${url} YouTube video ${post.externalId} still private 1+ hour after scheduled time`,
            {
              hoursSinceScheduled: Math.round(
                timeSinceScheduled / (60 * 60 * 1000),
              ),
              postId: post.id,
              publishAt: videoStatus.publishAt,
              scheduledDate: scheduledDate.toISOString(),
            },
          );
        }
      }
    } catch (error: unknown) {
      // If video not found on YouTube, mark post as deleted
      const errorMessage = getErrorMessage(error, {
        fallback: String,
        messageSource: 'error-instance',
      });
      if (
        errorMessage.includes('Video not found') ||
        errorMessage.includes('status not available')
      ) {
        this.logger.warn(
          `${url} video ${post.externalId} not found on YouTube, marking post as deleted`,
          { postId: post.id },
        );

        await this.applyStatusTransition(
          post,
          'deleted',
          'Video no longer exists on YouTube - marking post as deleted',
          'deleted',
          provenance,
        );

        return;
      }

      this.logger.error(
        `${url} failed to check status for post ${post.id}`,
        error,
      );
    }
  }

  private async applyStatusTransition(
    post: PostEntity,
    outcome: string,
    detail: string,
    providerStatus: string,
    provenance: SystemWorkflowProvenance,
  ): Promise<boolean> {
    return this.persistStatusTransition(
      {
        detail,
        organizationId: post.organizationId,
        outcome,
        postId: String(post.id),
        providerStatus,
        videoId: post.externalId,
      },
      provenance,
      post,
    );
  }

  private async executeStatusReconciliation(
    input: Record<string, unknown>,
    provenance: SystemWorkflowProvenance,
  ): Promise<boolean> {
    const organizationId = String(input.organizationId ?? '');
    const postId = String(input.postId ?? '');
    const post = await this.postsService.findOne({
      id: postId,
      organizationId,
    });
    if (!post) {
      throw new Error(`YouTube reconciliation post ${postId} not found`);
    }
    await this.checkPostStatus(post as unknown as PostEntity, provenance);
    return true;
  }

  private async persistStatusTransition(
    input: Record<string, unknown>,
    provenance: SystemWorkflowProvenance,
    loadedPost?: PostEntity,
  ): Promise<boolean> {
    const organizationId = String(input.organizationId ?? '');
    const postId = String(input.postId ?? '');
    const post =
      loadedPost ??
      ((await this.postsService.findOne({
        id: postId,
        organizationId,
      })) as unknown as PostEntity | null);
    if (!post) {
      throw new Error(`YouTube reconciliation post ${postId} not found`);
    }
    if (input.outcome === 'deleted') {
      await this.postsService.patch(postId, { isDeleted: true });
      return true;
    }

    const visibility = String(input.outcome ?? '') as PostVisibility;
    if (!Object.values(PostVisibility).includes(visibility)) {
      throw new Error(`Invalid YouTube visibility transition: ${visibility}`);
    }
    const publishedAt = post.publicationDate ?? new Date();
    const grouped = await this.schedulerPublishStateService.transitionPost(
      post as unknown as PostEntity,
      {
        error: null,
        executionState: TargetExecutionState.PUBLISHED,
        publicationDate: publishedAt,
        publishedAt,
        url: `https://www.youtube.com/watch?v=${String(input.videoId ?? '')}`,
        visibility,
        workflowExecutionId: provenance.executionId,
      },
      `YouTube reports ${String(input.providerStatus ?? '')}`,
      {
        expectedWorkflowExecutionId: provenance.executionId,
        priorExecutionStates: [
          TargetExecutionState.PUBLISHING,
          TargetExecutionState.PUBLISHED,
        ],
      },
    );
    if (!grouped) {
      this.logger.warn('Ignored stale YouTube status transition', {
        postId,
        workflowExecutionId: provenance.executionId,
      });
    }
    return grouped;
  }
}
