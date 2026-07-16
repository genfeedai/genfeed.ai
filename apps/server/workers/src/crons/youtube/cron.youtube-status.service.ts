import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  type SystemWorkflowProvenance,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import {
  CredentialPlatform,
  PostStatus,
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

const YOUTUBE_PRIVACY_STATUS_MAP: Record<string, PostStatus> = {
  private: PostStatus.PRIVATE,
  public: PostStatus.PUBLIC,
  unlisted: PostStatus.UNLISTED,
};

@Injectable()
export class CronYoutubeStatusService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly youtubeService: YoutubeService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
  ) {}

  /**
   * Checks status of non-public YouTube videos and syncs database status
   * with the actual YouTube video status. Stops checking once a video
   * becomes PUBLIC (final state). Fired daily at 1am UTC by the
   * system-sweeps BullMQ Job Scheduler (SystemSweepsProcessor).
   */
  async checkScheduledYoutubeVideos() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      // Find YouTube posts that haven't reached PUBLIC status yet
      // Check posts from the last 7 days to catch any status changes
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const options = {
        customLabels,
        limit: 100, // Check up to 100 posts per run
      };

      const posts = (await this.postsService.findAll(
        {
          include: { credential: true },
          where: {
            // Only check recent posts (last 7 days) to avoid checking old videos
            createdAt: { gte: sevenDaysAgo },
            externalId: { not: null },
            isDeleted: false,
            platform: CredentialPlatform.YOUTUBE,
            // Only check non-public statuses (PRIVATE, UNLISTED, SCHEDULED)
            // Once PUBLIC, no need to keep checking
            status: {
              in: [
                PostStatus.PRIVATE,
                PostStatus.UNLISTED,
                PostStatus.SCHEDULED, // Videos waiting to be uploaded
              ],
            },
          },
        },
        options,
      )) as unknown as { docs?: PostEntity[] };

      const postsChecked = posts.docs?.length || 0;

      if (postsChecked === 0) {
        this.logger.log(`${url} completed - no posts to check`);
        return;
      }

      this.logger.log(`${url} checking ${postsChecked} YouTube posts`);

      for (const post of posts.docs || []) {
        await this.checkPostStatus(post);
      }

      this.logger.log(`${url} completed - checked ${postsChecked} posts`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  /**
   * Check individual post status against YouTube API
   */
  private async checkPostStatus(post: PostEntity) {
    const url = `${this.constructorName} checkPostStatus`;

    try {
      if (!post.credential) {
        this.logger.warn(`${url} post ${post.id} has no credential`);
        return;
      }

      // Call YouTube API to get actual video status
      const videoStatus = await this.youtubeService.getVideoStatus(
        post.organization.toString(),
        post.brand.toString(),
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
      if (targetStatus && post.status !== targetStatus) {
        const updateData: Record<string, unknown> = {
          status: targetStatus,
        };

        // Set publicationDate when video becomes public for the first time
        if (targetStatus === PostStatus.PUBLIC && !post.publicationDate) {
          updateData.publicationDate = new Date();
        }

        const transitioned = await this.recordStatusTransition(
          post,
          targetStatus,
          `YouTube reports ${videoStatus.privacyStatus} - syncing post from ${post.status} to ${targetStatus}`,
          async (provenance) => {
            const isPublished = targetStatus === PostStatus.PUBLIC;
            const publishedAt = isPublished
              ? ((updateData.publicationDate as Date | undefined) ??
                post.publicationDate ??
                new Date())
              : undefined;
            const grouped =
              await this.schedulerPublishStateService.transitionPost(
                post,
                {
                  error: null,
                  executionState: isPublished
                    ? TargetExecutionState.PUBLISHED
                    : TargetExecutionState.PUBLISHING,
                  ...(publishedAt && {
                    publicationDate: publishedAt,
                    publishedAt,
                  }),
                  status: targetStatus,
                  ...(isPublished && {
                    url: `https://www.youtube.com/watch?v=${post.externalId}`,
                  }),
                  workflowExecutionId: provenance.executionId,
                },
                `YouTube reports ${videoStatus.privacyStatus}`,
                {
                  expectedWorkflowExecutionId: provenance.executionId,
                  priorExecutionStates: [TargetExecutionState.PUBLISHING],
                },
              );
            if (!grouped) {
              this.logger.warn('Ignored stale YouTube status transition', {
                postId: post.id.toString(),
                workflowExecutionId: provenance.executionId,
              });
            }
            return grouped;
          },
        );
        if (
          transitioned &&
          [PostStatus.PUBLIC, PostStatus.PRIVATE, PostStatus.UNLISTED].includes(
            targetStatus,
          )
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
            previousStatus: post.status,
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes('Video not found') ||
        errorMessage.includes('status not available')
      ) {
        this.logger.warn(
          `${url} video ${post.externalId} not found on YouTube, marking post as deleted`,
          { postId: post.id },
        );

        await this.recordStatusTransition(
          post,
          'deleted',
          'Video no longer exists on YouTube - marking post as deleted',
          async () => {
            await this.postsService.patch(post.id.toString(), {
              isDeleted: true,
            });
            return true;
          },
        );

        return;
      }

      this.logger.error(
        `${url} failed to check status for post ${post.id}`,
        error,
      );
    }
  }

  /**
   * Applies a post status transition inside a system workflow execution so
   * the reconciliation is tenant-inspectable (issue #1092). Provenance or
   * patch failures are logged and left for the next daily sweep - non-public
   * posts stay in the check window for 7 days.
   */
  private async recordStatusTransition(
    post: PostEntity,
    outcome: string,
    detail: string,
    transition: (provenance: SystemWorkflowProvenance) => Promise<boolean>,
  ): Promise<boolean> {
    try {
      const { result } =
        await this.systemWorkflowProvenanceService.runAction<boolean>(
          {
            actionType: 'youtube-status-reconciliation',
            canonicalId:
              SYSTEM_WORKFLOW_ACTION_IDS.YOUTUBE_STATUS_RECONCILIATION,
            description:
              'Syncs recent YouTube video visibility with the actual status reported by YouTube.',
            inputValues: {
              detail,
              outcome,
              postId: String(post.id),
              videoId: post.externalId,
            },
            label: 'YouTube Status Reconciliation',
            metadata: { platform: CredentialPlatform.YOUTUBE },
            organizationId: post.organization.toString(),
            postIds: [post.id.toString()],
            schedule: '0 1 * * *',
            source: 'CronYoutubeStatusService.checkPostStatus',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
            userId: post.user?.toString(),
          },
          transition,
        );
      return result;
    } catch (error: unknown) {
      this.logger.error('Failed to record YouTube status transition', {
        error: (error as Error)?.message,
        outcome,
        postId: String(post.id),
      });
      return false;
    }
  }
}
