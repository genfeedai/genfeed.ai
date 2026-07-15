import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  type SystemWorkflowProvenance,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import {
  CredentialPlatform,
  PostStatus,
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { IChannelTargetError } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { Injectable } from '@nestjs/common';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

type TiktokError = {
  message?: string;
  response?: {
    data?: {
      data?: { error?: { code?: string } };
      error?: string | { code?: string };
    };
  };
};

type TiktokPost = PostEntity & {
  credential?: {
    id?: string;
    accessToken?: string | null;
    externalHandle?: string | null;
    isConnected?: boolean;
  };
};

function readTiktokErrorCode(error: unknown): string | undefined {
  const response = (error as TiktokError | undefined)?.response;
  const rawError = response?.data?.error;
  if (typeof rawError === 'string') {
    return rawError;
  }
  return rawError?.code ?? response?.data?.data?.error?.code;
}

@Injectable()
export class CronTiktokStatusService {
  private readonly constructorName: string = String(this.constructor.name);

  // Max age for pending posts before marking as failed (24 hours)
  private readonly MAX_PENDING_AGE_HOURS = 24;

  // TikTok auth error codes that indicate credential needs re-authentication
  private readonly AUTH_ERROR_CODES = [
    'access_token_invalid',
    'invalid_grant',
    'invalid_refresh_token',
    'refresh_token_expired',
    'token_expired',
  ];

  constructor(
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly tiktokService: TiktokService,
    private readonly credentialsService: CredentialsService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
  ) {}

  /**
   * Check if an error is an authentication error
   */
  private isAuthError(error: unknown): boolean {
    const errorCode = readTiktokErrorCode(error);
    return errorCode ? this.AUTH_ERROR_CODES.includes(errorCode) : false;
  }

  /**
   * Get the error code from a TikTok API error
   */
  private getErrorCode(error: unknown): string | undefined {
    return readTiktokErrorCode(error);
  }

  /**
   * Checks status of PENDING TikTok posts and polls the TikTok API for a
   * post_id once moderation completes. Fired every 5 minutes by the
   * system-sweeps BullMQ Job Scheduler (SystemSweepsProcessor).
   */
  async checkPendingTiktokPosts(): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(`${url} started`);

    try {
      const now = new Date();
      const maxAge = new Date(
        now.getTime() - this.MAX_PENDING_AGE_HOURS * 60 * 60 * 1000,
      );

      const options = {
        customLabels,
        limit: 50,
      };

      // Find TikTok posts with PENDING status
      const posts = (await this.postsService.findAll(
        {
          include: { credential: true },
          where: {
            externalId: { not: null }, // Has publish_id
            isDeleted: false,
            platform: CredentialPlatform.TIKTOK,
            status: PostStatus.PENDING,
          },
        },
        options,
      )) as unknown as { docs?: TiktokPost[] };

      const postsToCheck = posts.docs?.length || 0;

      if (postsToCheck === 0) {
        this.logger.log(`${url} completed - no pending posts`);
        return;
      }

      this.logger.log(`${url} checking ${postsToCheck} pending TikTok posts`);

      for (const post of posts.docs || []) {
        await this.checkPostStatus(post, now, maxAge);
      }

      this.logger.log(`${url} completed`);
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, error);
    }
  }

  /**
   * Check individual post status against TikTok API
   */
  private async checkPostStatus(
    post: TiktokPost,
    now: Date,
    maxAge: Date,
  ): Promise<void> {
    const url = `${this.constructorName} checkPostStatus`;
    const publishId = post.externalId; // This is the publish_id stored temporarily

    try {
      // Check if post has been PENDING too long (use updatedAt since that's when it became PENDING)
      const pendingSince = new Date(post.updatedAt);
      if (pendingSince < maxAge) {
        this.logger.warn(`${url} post ${post.id} exceeded max pending age`, {
          hoursPending: Math.round(
            (now.getTime() - pendingSince.getTime()) / (60 * 60 * 1000),
          ),
          postId: post.id,
          publishId,
        });

        await this.markPostFailed(
          post,
          'TikTok moderation timeout - exceeded 24 hours',
        );
        return;
      }

      // Get credential for API call
      const credential = (
        post as unknown as {
          credential?: {
            id?: string;
            accessToken?: string;
            externalHandle?: string;
            isConnected?: boolean;
          };
        }
      ).credential;
      if (!credential?.id || !credential.accessToken) {
        this.logger.warn(`${url} post ${post.id} has no valid credential`);
        await this.markPostFailed(
          post,
          'TikTok credential not found - please reconnect',
        );
        return;
      }

      // Check if credential is already disconnected
      if (credential.isConnected === false) {
        this.logger.warn(
          `${url} post ${post.id} has disconnected credential - marking as failed`,
        );
        await this.markPostFailed(
          post,
          'TikTok credential disconnected - please reconnect your TikTok account',
        );
        return;
      }

      // Refresh token before API call - pass credentialId to ensure we use the correct credential
      const refreshedCredential = await this.tiktokService.refreshToken(
        post.organization.toString(),
        post.brand.toString(),
        credential.id,
      );

      const decryptedAccessToken = EncryptionUtil.decrypt(
        refreshedCredential.accessToken ?? '',
      );

      // Call TikTok API to check publish status
      // Single attempt per cron run - cron runs every 5 minutes so no need to retry here
      const statusData = await this.tiktokService.getPublishStatus(
        decryptedAccessToken,
        publishId,
        1, // Single attempt per cron run
        0, // No delay needed
      );

      const hasPostId = !!statusData?.publicly_available_post_id?.[0];
      this.logger.log(`${url} post ${post.id} status check`, {
        hasPostId,
        publicly_available_post_id: statusData?.publicly_available_post_id,
        publishId,
        status: statusData?.status,
      });

      // Check if moderation complete and post_id available
      if (statusData?.status === 'PUBLISH_COMPLETE' && hasPostId) {
        const postId = String(statusData.publicly_available_post_id?.[0]);
        const postUrl = `https://www.tiktok.com/@${credential.externalHandle}/video/${postId}`;

        // Update post with real post_id and mark as PUBLIC
        const transitioned = await this.recordStatusTransition(
          post,
          'published',
          `TikTok moderation completed - post ${postId} is live`,
          async (provenance) => {
            const publishedAt = new Date();
            const grouped =
              await this.schedulerPublishStateService.transitionPost(
                post,
                {
                  error: null,
                  executionState: TargetExecutionState.PUBLISHED,
                  externalId: postId,
                  publicationDate: publishedAt,
                  publishedAt,
                  status: PostStatus.PUBLIC,
                  url: postUrl,
                  workflowExecutionId: provenance.executionId,
                },
                `TikTok moderation completed - post ${postId} is live`,
                {
                  expectedWorkflowExecutionId: provenance.executionId,
                  priorExecutionStates: [TargetExecutionState.PUBLISHING],
                },
              );
            if (!grouped) {
              this.logger.warn('Ignored stale TikTok publish confirmation', {
                postId: String(post.id),
                workflowExecutionId: provenance.executionId,
              });
            }
            return grouped;
          },
        );
        if (transitioned) {
          void this.publishEventWebhookService.emitLegacyPostPublished({
            externalProviderId: postId,
            occurredAt: now,
            platform: CredentialPlatform.TIKTOK,
            post,
            url: postUrl,
          });
        }

        this.logger.log(`${url} post ${post.id} verified and published`, {
          postId,
          publishId,
          url: postUrl,
        });
        return;
      }

      // Note: If status === 'FAILED', getPublishStatus() throws an error which is caught
      // in the catch block below and handled by markPostFailed()

      // If PUBLISH_COMPLETE but no post_id, log and wait for next cron run
      if (statusData?.status === 'PUBLISH_COMPLETE' && !hasPostId) {
        const pendingSince = new Date(post.updatedAt);
        const hoursPending = Math.round(
          (now.getTime() - pendingSince.getTime()) / (60 * 60 * 1000),
        );
        this.logger.log(
          `${url} post ${post.id} is PUBLISH_COMPLETE but no post_id yet - will retry next cron run`,
          { hoursPending, publishId },
        );
      }
    } catch (error: unknown) {
      this.logger.error(`${url} failed for post ${post.id}`, {
        error: (error as Error)?.message,
        publishId,
      });

      // Check if this is a TikTok moderation failure (thrown by getPublishStatus when status === 'FAILED')
      const errorMessage = (error as TiktokError).message ?? '';
      if (errorMessage.startsWith('TikTok publish failed:')) {
        const failReason =
          errorMessage.replace('TikTok publish failed: ', '') ||
          'TikTok moderation rejected the post';
        await this.markPostFailed(post, failReason);
        return;
      }

      // Check if this is an auth error - mark credential as disconnected and fail the post
      if (this.isAuthError(error)) {
        const errorCode = this.getErrorCode(error);
        this.logger.warn(
          `${url} auth error for post ${post.id} - marking credential as disconnected`,
          { errorCode },
        );

        // Mark credential as disconnected (TiktokService.refreshToken should have done this already,
        // but we do it here as a safety net)
        if (
          (
            post as unknown as {
              credential?: {
                id?: string;
                accessToken?: string;
                isConnected?: boolean;
              };
            }
          ).credential?.id
        ) {
          try {
            const credentialId = post.credential?.id;
            if (!credentialId) {
              return;
            }
            await this.credentialsService.patch(credentialId, {
              isConnected: false,
            });
          } catch (patchError: unknown) {
            this.logger.error(
              `${url} failed to mark credential as disconnected`,
              patchError,
            );
          }
        }

        // Mark post as failed with clear message
        await this.markPostFailed(
          post,
          'TikTok authentication expired - please reconnect your TikTok account',
        );
        return;
      }

      // Don't mark as failed on transient errors - will retry next cron run
    }
  }

  /**
   * Mark a post as failed
   */
  private async markPostFailed(
    post: TiktokPost,
    reason: string,
  ): Promise<void> {
    const transitioned = await this.recordStatusTransition(
      post,
      'failed',
      reason,
      async (provenance) => {
        const targetError: IChannelTargetError = {
          code: 'tiktok_publish_failed',
          failedAt: new Date().toISOString(),
          isRetryable: false,
          message: reason,
        };
        const grouped = await this.schedulerPublishStateService.transitionPost(
          post,
          {
            error: targetError,
            executionState: TargetExecutionState.FAILED,
            status: PostStatus.FAILED,
            workflowExecutionId: provenance.executionId,
          },
          reason,
          {
            expectedWorkflowExecutionId: provenance.executionId,
            priorExecutionStates: [TargetExecutionState.PUBLISHING],
          },
        );
        if (!grouped) {
          this.logger.warn('Ignored stale TikTok publish failure', {
            postId: String(post.id),
            workflowExecutionId: provenance.executionId,
          });
        }
        return grouped;
      },
    );
    if (transitioned) {
      void this.publishEventWebhookService.emitLegacyPostFailed({
        errorMessage: reason,
        platform: CredentialPlatform.TIKTOK,
        post,
      });
    }

    this.logger.warn(`Post ${String(post.id)} marked as failed`, {
      reason,
    });
  }

  /**
   * Applies a post status transition inside a system workflow execution so
   * the reconciliation is tenant-inspectable (issue #1092). Provenance or
   * patch failures are logged and left for the next sweep: posts stay
   * PENDING and are re-checked every 5 minutes.
   */
  private async recordStatusTransition(
    post: TiktokPost,
    outcome: 'published' | 'failed',
    detail: string,
    transition: (provenance: SystemWorkflowProvenance) => Promise<boolean>,
  ): Promise<boolean> {
    try {
      const { result } =
        await this.systemWorkflowProvenanceService.runAction<boolean>(
          {
            actionType: 'tiktok-status-reconciliation',
            canonicalId:
              SYSTEM_WORKFLOW_ACTION_IDS.TIKTOK_STATUS_RECONCILIATION,
            description:
              'Verifies pending TikTok publications and reconciles post status once moderation completes.',
            failureMessage: () => (outcome === 'failed' ? detail : undefined),
            inputValues: {
              detail,
              outcome,
              postId: String(post.id),
              publishId: post.externalId,
            },
            label: 'TikTok Status Reconciliation',
            metadata: { platform: CredentialPlatform.TIKTOK },
            organizationId: post.organization.toString(),
            postIds: [String(post.id)],
            schedule: '*/5 * * * *',
            source: 'CronTiktokStatusService.checkPostStatus',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
            userId: post.user?.toString(),
          },
          transition,
        );
      return result;
    } catch (error: unknown) {
      this.logger.error('Failed to record TikTok status transition', {
        error: (error as Error)?.message,
        outcome,
        postId: String(post.id),
      });
      return false;
    }
  }
}
