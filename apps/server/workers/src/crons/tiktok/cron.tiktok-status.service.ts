import {
  CredentialPlatform,
  PostVisibility,
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { IChannelTargetError } from '@genfeedai/interfaces';
import {
  type PublishResult,
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { PostEntity } from '@server/collections/posts/entities/post.entity';
import { PostsService } from '@server/collections/posts/services/posts.service';
import { WorkflowExecutionQueueService } from '@server/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowProvenance,
  SystemWorkflowRunnerService,
} from '@server/collections/workflows/system-workflow-runner.service';
import { customLabels } from '@server/helpers/utils/pagination.util';
import { TiktokService } from '@server/services/integrations/tiktok/services/tiktok.service';
import { PublishEventWebhookService } from '@server/services/webhook-client/publish-event-webhook.service';
import {
  buildTiktokStatusReconcileDefinition,
  buildTiktokStatusSweepDefinition,
  TIKTOK_STATUS_ACTION_IDS,
} from '@workers/crons/tiktok/tiktok-status-workflow-definition';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';
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

const TIKTOK_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SYSTEM_MAINTENANCE_PRINCIPAL_ID = 'genfeed-public-tools';

function readTiktokErrorCode(error: unknown): string | undefined {
  const response = (error as TiktokError | undefined)?.response;
  const rawError = response?.data?.error;
  if (typeof rawError === 'string') {
    return rawError;
  }
  return rawError?.code ?? response?.data?.data?.error?.code;
}

@Injectable()
export class CronTiktokStatusService implements OnModuleInit {
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
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
    private readonly scheduledPostWorkflowService: ScheduledPostWorkflowService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      TIKTOK_STATUS_ACTION_IDS.DISCOVER,
      ({ input }) => this.discoverPendingPosts(input.request),
    );
    this.systemWorkflowRunner.registerAction(
      TIKTOK_STATUS_ACTION_IDS.RECONCILE,
      ({ input, provenance }) =>
        this.executeStatusReconciliation(
          input.request as Record<string, unknown>,
          provenance,
        ),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildTiktokStatusSweepDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildTiktokStatusReconcileDefinition(),
    );
  }

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
   * platform BullMQ schedule.
   */
  async checkPendingTiktokPosts(): Promise<void> {
    const now = new Date();
    const definition = buildTiktokStatusSweepDefinition();
    await this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: { now: now.toISOString() } },
        metadata: { platform: CredentialPlatform.TIKTOK },
        organizationId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
        source: 'tiktok_status_sweep',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: SYSTEM_MAINTENANCE_PRINCIPAL_ID,
      },
      `tiktok-status-sweep-${Math.floor(now.getTime() / TIKTOK_SWEEP_INTERVAL_MS)}`,
      { attempts: 3, replaceTerminalJob: true },
    );
  }

  private async discoverPendingPosts(request: unknown) {
    const now = new Date(
      String((request as { now?: unknown } | undefined)?.now ?? ''),
    );
    if (!Number.isFinite(now.getTime())) {
      throw new Error('TikTok status sweep requires a valid timestamp');
    }
    const maxAge = new Date(
      now.getTime() - this.MAX_PENDING_AGE_HOURS * 60 * 60 * 1000,
    );
    const posts = (await this.postsService.findAll(
      {
        include: { credential: true },
        where: {
          externalId: { not: null },
          isDeleted: false,
          platform: CredentialPlatform.TIKTOK,
          targetExecutionState: TargetExecutionState.PUBLISHING,
        },
      },
      { customLabels, limit: 50 },
    )) as unknown as { docs?: TiktokPost[] };
    return {
      items: (posts.docs ?? []).map((post) => ({
        maxAge: maxAge.toISOString(),
        now: now.toISOString(),
        organizationId: post.organizationId,
        postId: String(post.id),
      })),
    };
  }

  /**
   * Check individual post status against TikTok API
   */
  private async checkPostStatus(
    post: TiktokPost,
    now: Date,
    maxAge: Date,
    provenance: SystemWorkflowProvenance,
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
          provenance,
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
          provenance,
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
          provenance,
        );
        return;
      }

      // Refresh token before API call - pass credentialId to ensure we use the correct credential
      const organizationId = post.organizationId;
      const brandId = post.brandId;
      if (!organizationId || !brandId) {
        this.logger.warn(
          `${url} post ${post.id} missing organizationId/brandId — skipping refresh`,
        );
        return;
      }
      const refreshedCredential = await this.tiktokService.refreshToken(
        organizationId,
        brandId,
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
        const transitioned = await this.applyStatusTransition(
          post,
          'published',
          `TikTok moderation completed - post ${postId} is live`,
          { externalPostId: postId, postUrl },
          provenance,
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
      const errorMessage = getErrorMessage(error, { fallback: () => '' });
      this.logger.error(`${url} failed for post ${post.id}`, {
        error: getErrorMessage(error, { fallback: () => undefined }),
        publishId,
      });

      // Check if this is a TikTok moderation failure (thrown by getPublishStatus when status === 'FAILED')
      if (errorMessage.startsWith('TikTok publish failed:')) {
        const failReason =
          errorMessage.replace('TikTok publish failed: ', '') ||
          'TikTok moderation rejected the post';
        await this.markPostFailed(post, failReason, provenance);
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
          provenance,
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
    provenance: SystemWorkflowProvenance,
  ): Promise<void> {
    const transitioned = await this.applyStatusTransition(
      post,
      'failed',
      reason,
      { reason },
      provenance,
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

  private async applyStatusTransition(
    post: TiktokPost,
    outcome: 'published' | 'failed',
    detail: string,
    transitionInput: Record<string, unknown>,
    provenance: SystemWorkflowProvenance,
  ): Promise<boolean> {
    const transitioned = await this.persistStatusTransition(
      {
        detail,
        organizationId: post.organizationId,
        outcome,
        postId: String(post.id),
        publishId: post.externalId,
        ...transitionInput,
      },
      provenance,
      post,
    );

    // The transition guard (SchedulerPublishStateService, PUBLISHING ->
    // PUBLISHED via a Serializable transaction) only reports `transitioned`
    // once per post: a stale or repeat transition returns false. That makes
    // it the idempotency marker for finalize - no separate "already
    // finalized" flag is needed.
    if (outcome === 'published' && transitioned) {
      const result: PublishResult = {
        executionState: TargetExecutionState.PUBLISHED,
        externalId: String(transitionInput.externalPostId ?? ''),
        isProviderDraft: false,
        platform: CredentialPlatform.TIKTOK,
        success: true,
        url: String(transitionInput.postUrl ?? ''),
      };
      await this.scheduledPostWorkflowService.finalizePublishedPost(
        post,
        result,
        'CronTiktokStatusService.applyStatusTransition',
      );
    }

    return transitioned;
  }

  private async executeStatusReconciliation(
    input: Record<string, unknown>,
    provenance: SystemWorkflowProvenance,
  ): Promise<boolean> {
    const organizationId = String(input.organizationId ?? '');
    const postId = String(input.postId ?? '');
    const post = (await this.postsService.findOne(
      { id: postId, organizationId },
      ['credential'],
    )) as TiktokPost | null;
    if (!post) {
      throw new Error(`TikTok reconciliation post ${postId} not found`);
    }

    const now = new Date(String(input.now ?? ''));
    const maxAge = new Date(String(input.maxAge ?? ''));
    if (!Number.isFinite(now.getTime()) || !Number.isFinite(maxAge.getTime())) {
      throw new Error('TikTok reconciliation requires valid sweep timestamps');
    }
    await this.checkPostStatus(post, now, maxAge, provenance);
    return true;
  }

  private async persistStatusTransition(
    input: Record<string, unknown>,
    provenance: SystemWorkflowProvenance,
    loadedPost?: TiktokPost,
  ): Promise<boolean> {
    const organizationId = String(input.organizationId ?? '');
    const postId = String(input.postId ?? '');
    const post =
      loadedPost ??
      ((await this.postsService.findOne({
        id: postId,
        organizationId,
      })) as TiktokPost | null);
    if (!post) {
      throw new Error(`TikTok reconciliation post ${postId} not found`);
    }

    const outcome = input.outcome;
    const isPublished = outcome === 'published';
    const detail = String(input.detail ?? 'TikTok status reconciliation');
    const publishedAt = new Date();
    const error: IChannelTargetError | null = isPublished
      ? null
      : {
          code: 'tiktok_publish_failed',
          failedAt: publishedAt.toISOString(),
          isRetryable: false,
          message: String(input.reason ?? detail),
        };
    const grouped = await this.schedulerPublishStateService.transitionPost(
      post as unknown as TiktokPost,
      isPublished
        ? {
            error: null,
            executionState: TargetExecutionState.PUBLISHED,
            externalId: String(input.externalPostId ?? ''),
            publicationDate: publishedAt,
            publishedAt,
            url: String(input.postUrl ?? ''),
            visibility: PostVisibility.PUBLIC,
            workflowExecutionId: provenance.executionId,
          }
        : {
            error,
            executionState: TargetExecutionState.FAILED,
            workflowExecutionId: provenance.executionId,
          },
      detail,
      {
        expectedWorkflowExecutionId: provenance.executionId,
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      },
    );
    if (!grouped) {
      this.logger.warn('Ignored stale TikTok status transition', {
        outcome,
        postId,
        workflowExecutionId: provenance.executionId,
      });
    }
    return grouped;
  }
}
