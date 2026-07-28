import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PublisherFactoryService } from '@api/services/integrations/publishers/publisher-factory.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/webhook-client.module';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  PostStatus,
  TargetExecutionState,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { IChannelTargetError } from '@genfeedai/interfaces';
import type { PostPublishJobData } from '@genfeedai/queue-contracts';
import { PublishApprovalsService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';
import { ScheduledPostQueueService } from '@workers/services/scheduled-post-queue.service';
import {
  SchedulerPublishStateService,
  type SchedulerPublishTargetUpdate,
  type SchedulerPublishTransitionGuard,
} from '@workers/services/scheduler-publish-state.service';

type QuotaCheckResult = {
  allowed: boolean;
  currentCount: number;
  dailyLimit: number;
};

type QueuedPostPublishSkip = {
  reason: 'not_eligible';
  skipped: true;
};

@Injectable()
export class CronPostsService {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor(
    private readonly logger: LoggerService,
    private readonly activitiesService: ActivitiesService,
    private readonly credentialsService: CredentialsService,
    private readonly organizationsService: OrganizationsService,
    private readonly postsService: PostsService,
    private readonly quotaService: QuotaService,
    private readonly publisherFactory: PublisherFactoryService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly publishApprovalsService: PublishApprovalsService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
    private readonly postRepeatSchedulerService: PostRepeatSchedulerService,
    private readonly scheduledPostExecutionGuardService: ScheduledPostExecutionGuardService,
    private readonly scheduledPostQueueService: ScheduledPostQueueService,
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
          platform: post.platform,
          status: PostStatus.PUBLIC,
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
    const result = await this.publishSinglePost(post);

    await this.publishApprovalsService.completeExecution({
      approvalId,
      ...(result.error ? { error: result.error } : {}),
      executionStartedAt,
      isSuccessful: result.success,
      operationId,
      organizationId: job.organizationId,
      versionPinId,
    });

    if (result.success) {
      await this.activitiesService.create(
        new ActivityEntity({
          brand: readPostString(post, ['brandId', 'brand']) ?? null,
          entityId: post.id,
          entityModel: ActivityEntityModel.POST,
          key: ActivityKey.POST_PUBLISHED,
          organization:
            readPostString(post, ['organizationId', 'organization']) ?? null,
          source: ActivitySource.POST,
          user: readPostString(post, ['userId', 'user']) ?? null,
          value: `Published to ${result.platform}: ${result.url}`,
        }),
      );

      await this.postRepeatSchedulerService.scheduleNextRepeat(post, url);
    }

    return result;
  }

  private async handleTerminalPublishValidationFailure(
    post: PostEntity,
    error: unknown,
  ): Promise<PublishResult> {
    const errorMessage =
      error instanceof Error ? error.message : 'Publish validation failed';

    this.logger.error('Durable validation rejected queued publishing', {
      error: errorMessage,
      postId: post.id,
    });
    await this.attemptRetry(
      post,
      false,
      errorMessage,
      'publish_validation_failed',
    );
    this.emitPublishFailedWebhook(post, errorMessage);

    return this.createFailedResult('', errorMessage);
  }

  private async persistPublishState(
    post: PostEntity,
    update: SchedulerPublishTargetUpdate,
    reason?: string,
    guard?: SchedulerPublishTransitionGuard,
  ): Promise<boolean> {
    const handled = await this.schedulerPublishStateService.transitionPost(
      post,
      update,
      reason,
      guard,
    );
    if (handled) {
      return true;
    }

    if (guard?.expectedWorkflowExecutionId) {
      this.logger.warn(
        'Skipped guarded publish fallback without a durable tenant identity',
        {
          expectedWorkflowExecutionId: guard.expectedWorkflowExecutionId,
          postId: post.id.toString(),
        },
      );
      return false;
    }

    await this.postsService.patch(post.id.toString(), {
      ...(update.error !== undefined && { targetError: update.error }),
      ...(update.externalId !== undefined && {
        externalId: update.externalId,
      }),
      ...(update.externalShortcode !== undefined && {
        externalShortcode: update.externalShortcode,
      }),
      ...(update.lastAttemptAt !== undefined && {
        lastAttemptAt: update.lastAttemptAt,
      }),
      ...(update.publicationDate !== undefined && {
        publicationDate: update.publicationDate,
      }),
      ...(update.publishedAt !== undefined && {
        publishedAt: update.publishedAt,
      }),
      ...(update.retryCount !== undefined && {
        retryCount: update.retryCount,
      }),
      status: update.status,
      targetExecutionState: update.executionState,
      ...(update.url !== undefined && { url: update.url }),
      ...(update.workflowExecutionId !== undefined && {
        workflowExecutionId: update.workflowExecutionId,
      }),
    } as never);
    return true;
  }

  private createTargetError(
    code: string,
    message: string,
    isRetryable: boolean,
  ): IChannelTargetError {
    return {
      code,
      failedAt: new Date().toISOString(),
      isRetryable,
      message,
    };
  }

  private errorCode(error: unknown): string {
    const message = this.errorMessage(error).toLowerCase();
    const rawCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '').toLowerCase()
        : '';
    const classificationText = `${rawCode} ${message}`;
    if (
      classificationText.includes('rate limit') ||
      classificationText.includes('429')
    ) {
      return 'rate_limited';
    }
    if (
      classificationText.includes('timeout') ||
      classificationText.includes('timed out') ||
      classificationText.includes('etimedout')
    ) {
      return 'timeout';
    }
    if (/\b(500|502|503|504)\b/.test(classificationText)) {
      return 'provider_unavailable';
    }
    return rawCode.replace(/[^a-z0-9]+/g, '_') || 'provider_error';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : String(error || 'Post failed');
  }

  private async publishSinglePost(post: PostEntity): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    // Mark post as PROCESSING immediately to prevent race conditions and show user feedback
    // lastAttemptAt enforces 60s backoff between attempts
    await this.persistPublishState(post, {
      error: null,
      executionState: TargetExecutionState.PUBLISHING,
      lastAttemptAt: new Date(),
      status: PostStatus.PROCESSING,
    });

    const postCredentialId = readPostString(post, [
      'credentialId',
      'credential',
    ]);
    const postOrganizationId = readPostString(post, [
      'organizationId',
      'organization',
    ]);
    const postBrandId = readPostString(post, ['brandId', 'brand']);
    const postUserId = readPostString(post, ['userId', 'user']);
    let workflowExecutionId: string | undefined;

    try {
      // Get credential
      const credential = await this.credentialsService.findOne({
        _id: postCredentialId,
      });

      if (!credential) {
        this.logger.error(`${url} credential not found`, { postId: post.id });
        await this.persistPublishState(
          post,
          {
            error: this.createTargetError(
              'credential_not_found',
              'Credential not found',
              false,
            ),
            executionState: TargetExecutionState.FAILED,
            status: PostStatus.FAILED,
          },
          'Credential not found',
        );
        this.emitPublishFailedWebhook(post, 'Credential not found');
        return this.createFailedResult('', 'Credential not found');
      }

      // Get organization
      const organization = await this.organizationsService.findOne({
        _id: postOrganizationId,
      });

      if (!organization) {
        this.logger.error(`${url} organization not found`, {
          postId: post.id,
        });
        await this.persistPublishState(
          post,
          {
            error: this.createTargetError(
              'organization_not_found',
              'Organization not found',
              false,
            ),
            executionState: TargetExecutionState.FAILED,
            status: PostStatus.FAILED,
          },
          'Organization not found',
        );
        this.emitPublishFailedWebhook(post, 'Organization not found');
        return this.createFailedResult('', 'Organization not found');
      }

      // Check quota
      const quotaCheck = (await this.quotaService.checkQuota(
        credential,
        organization,
      )) as QuotaCheckResult;
      if (!quotaCheck.allowed) {
        this.logger.warn(`${url} quota exceeded for ${credential.platform}`, {
          currentCount: quotaCheck.currentCount,
          dailyLimit: quotaCheck.dailyLimit,
          platform: credential.platform,
          postId: post.id,
        });

        await this.persistPublishState(
          post,
          {
            error: this.createTargetError(
              'quota_exceeded',
              'Quota exceeded',
              false,
            ),
            executionState: TargetExecutionState.FAILED,
            status: PostStatus.FAILED,
          },
          'Quota exceeded',
        );
        await this.logQuotaExceededActivity(
          post,
          quotaCheck,
          credential.platform,
        );
        this.emitPublishFailedWebhook(
          post,
          'Quota exceeded',
          credential.platform,
        );

        return this.createFailedResult(credential.platform, 'Quota exceeded');
      }

      // Get publisher for platform
      const platform = credential.platform as CredentialPlatform;
      const publisher = this.publisherFactory.getPublisher(platform);
      if (!publisher) {
        this.logger.error(`${url} unsupported platform`, {
          platform: credential.platform,
          postId: post.id,
        });
        await this.persistPublishState(
          post,
          {
            error: this.createTargetError(
              'unsupported_platform',
              'Unsupported platform',
              false,
            ),
            executionState: TargetExecutionState.FAILED,
            status: PostStatus.FAILED,
          },
          'Unsupported platform',
        );
        this.emitPublishFailedWebhook(post, 'Unsupported platform', platform);
        return this.createFailedResult(platform, 'Unsupported platform');
      }

      // Build publish context
      const context: PublishContext = {
        brandId: postBrandId ?? '',
        credential,
        organization,
        organizationId: postOrganizationId ?? '',
        post,
        postId: post.id.toString(),
      };

      // Publish using the platform publisher, with a durable workflow execution
      // record so scheduled publishing is inspectable as a system workflow.
      const { provenance, result } =
        await this.systemWorkflowProvenanceService.runAction<PublishResult>(
          {
            actionType: 'publish-post',
            canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.SCHEDULED_POST_PUBLISHING,
            description:
              'Publishes due scheduled posts through the connected brand credential.',
            failureMessage: (publishResult) =>
              publishResult.success
                ? undefined
                : publishResult.error || 'Scheduled post publishing failed',
            inputValues: {
              brandId: postBrandId ?? '',
              platform: credential.platform,
              postId: post.id.toString(),
              scheduledDate:
                post.scheduledDate instanceof Date
                  ? post.scheduledDate.toISOString()
                  : post.scheduledDate,
            },
            label: 'Scheduled Post Publishing',
            metadata: {
              credentialId: credential.id?.toString?.() ?? credential.id,
              hasThreadChildren: Boolean(post.children?.length),
            },
            organizationId: postOrganizationId ?? '',
            postIds: [post.id.toString()],
            schedule: '*/15 * * * *',
            source: 'CronPostsService.publishSinglePost',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
            userId: postUserId,
          },
          (currentProvenance) => {
            workflowExecutionId = currentProvenance.executionId;
            return publisher.publish(context);
          },
        );
      workflowExecutionId = provenance.executionId;
      const transitionGuard: SchedulerPublishTransitionGuard = {
        expectedWorkflowExecutionId: workflowExecutionId,
        priorExecutionStates: [TargetExecutionState.PUBLISHING],
      };

      if (result.success) {
        if (!result.externalId) {
          this.logger.warn(`${url} provider returned no external id`, {
            platform: credential.platform,
            postId: post.id.toString(),
          });
        }
        // Check if this is a PENDING post (e.g., TikTok deferred verification)
        if (result.status === PostStatus.PENDING) {
          // Store publish_id temporarily, mark as PENDING
          // Cron job will verify and update to PUBLIC once platform confirms
          const persisted = await this.persistPublishState(
            post,
            {
              error: null,
              executionState: TargetExecutionState.PUBLISHING,
              externalId: result.externalId,
              status: PostStatus.PENDING,
              url: result.url || null,
              workflowExecutionId,
            },
            undefined,
            transitionGuard,
          );
          if (!persisted) {
            return result;
          }

          this.logger.log(
            `${url} post marked PENDING for deferred verification`,
            {
              platform: credential.platform,
              postId: post.id.toString(),
              publishId: result.externalId,
            },
          );

          return result;
        }

        // Immediate success - update post with external ID and status
        const publishedAt = new Date();
        const persisted = await this.persistPublishState(
          post,
          {
            error: null,
            executionState: TargetExecutionState.PUBLISHED,
            externalId: result.externalId,
            externalShortcode: result.externalShortcode ?? null,
            publicationDate: publishedAt,
            publishedAt,
            status: PostStatus.PUBLIC,
            url: result.url || null,
            workflowExecutionId,
          },
          undefined,
          transitionGuard,
        );
        if (!persisted) {
          return result;
        }

        // Handle thread children (for platforms that support threads)
        const children = (post.children || []) as unknown as PostDocument[];
        if (
          children.length > 0 &&
          publisher.supportsThreads &&
          result.externalId
        ) {
          if (publisher.publishThreadChildren) {
            try {
              await publisher.publishThreadChildren(
                context,
                children,
                result.externalId,
              );
            } catch (error: unknown) {
              const errorMessage = this.errorMessage(error);
              this.logger.error(
                `${url} failed to publish thread children after parent success`,
                {
                  childrenCount: children.length,
                  error: errorMessage,
                  externalId: result.externalId,
                  platform: credential.platform,
                  postId: post.id.toString(),
                },
              );
              await this.failChildren(post, errorMessage);
            }
          } else {
            this.logger.warn(
              `${url} platform supports threads but publishThreadChildren not implemented`,
              {
                childrenCount: children.length,
                platform: credential.platform,
                postId: post.id.toString(),
              },
            );
          }
        }

        this.emitPublishPublishedWebhook(post, result, credential.platform);

        this.logger.log(`${url} published post successfully`, {
          childrenCount: children.length,
          externalId: result.externalId,
          platform: credential.platform,
          postId: post.id.toString(),
        });
      } else if (!result.success) {
        // Handle retry logic
        return await this.handlePublishFailure(
          post,
          result,
          credential.platform,
          workflowExecutionId,
        );
      }

      return result;
    } catch (error: unknown) {
      return await this.handlePublishError(post, error, workflowExecutionId);
    }
  }

  private async attemptRetry(
    post: PostEntity,
    canRetry: boolean,
    errorMessage: string,
    errorCode = this.errorCode(errorMessage),
    workflowExecutionId?: string,
  ): Promise<boolean | undefined> {
    const url = `${this.constructorName} attemptRetry`;
    const currentRetryCount = post.retryCount || 0;

    if (canRetry) {
      const targetError = this.createTargetError(errorCode, errorMessage, true);
      const persisted = await this.persistPublishState(
        post,
        {
          error: targetError,
          executionState: TargetExecutionState.SCHEDULED,
          lastAttemptAt: new Date(),
          retryCount: currentRetryCount + 1,
          status: PostStatus.SCHEDULED,
          ...(workflowExecutionId ? { workflowExecutionId } : {}),
        },
        errorMessage,
        workflowExecutionId
          ? {
              expectedWorkflowExecutionId: workflowExecutionId,
              priorExecutionStates: [TargetExecutionState.PUBLISHING],
            }
          : undefined,
      );
      if (!persisted) {
        return undefined;
      }

      this.logger.log(
        `${url} will retry post (attempt ${currentRetryCount + 1}/${this.MAX_RETRY_ATTEMPTS}) after ${SCHEDULED_POST_RETRY_BACKOFF_SECONDS}s backoff`,
        { postId: post.id },
      );

      return true;
    }

    // Max retries reached - mark parent and children as failed
    const persisted = await this.persistPublishState(
      post,
      {
        error: this.createTargetError(errorCode, errorMessage, false),
        executionState: TargetExecutionState.FAILED,
        lastAttemptAt: new Date(),
        status: PostStatus.FAILED,
        ...(workflowExecutionId ? { workflowExecutionId } : {}),
      },
      errorMessage,
      workflowExecutionId
        ? {
            expectedWorkflowExecutionId: workflowExecutionId,
            priorExecutionStates: [TargetExecutionState.PUBLISHING],
          }
        : undefined,
    );
    if (!persisted) {
      return undefined;
    }
    await this.failChildren(post, 'Parent post failed');
    await this.logFailedActivity(post, errorMessage);

    return false;
  }

  private async handlePublishFailure(
    post: PostEntity,
    result: PublishResult,
    platform: CredentialPlatform | string,
    workflowExecutionId?: string,
  ): Promise<PublishResult> {
    const currentRetryCount = post.retryCount || 0;
    const isRetryable = this.isRetryableError(result.error);
    const canRetry = isRetryable && currentRetryCount < this.MAX_RETRY_ATTEMPTS;
    const errorMessage = result.error || 'Max retries reached';

    const scheduledForRetry = await this.attemptRetry(
      post,
      canRetry,
      errorMessage,
      this.errorCode(result.error),
      workflowExecutionId,
    );

    if (scheduledForRetry) {
      return {
        externalId: null,
        platform,
        status: PostStatus.SCHEDULED,
        success: false,
        url: '',
      };
    }

    if (scheduledForRetry === undefined) {
      return result;
    }

    this.emitPublishFailedWebhook(post, errorMessage, platform);
    return result;
  }

  private async handlePublishError(
    post: PostEntity,
    error: unknown,
    workflowExecutionId?: string,
  ): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const currentRetryCount = post.retryCount || 0;
    const isRetryable = this.isRetryableError(error);
    const canRetry = isRetryable && currentRetryCount < this.MAX_RETRY_ATTEMPTS;
    const errorMessage = this.errorMessage(error);

    this.logger.error(`${url} failed to publish post`, {
      canRetry,
      error: errorMessage,
      isRetryable,
      postId: post.id,
      retryCount: currentRetryCount,
    });

    const scheduledForRetry = await this.attemptRetry(
      post,
      canRetry,
      errorMessage,
      this.errorCode(error),
      workflowExecutionId,
    );

    if (scheduledForRetry) {
      return {
        externalId: null,
        platform: '',
        status: PostStatus.SCHEDULED,
        success: false,
        url: '',
      };
    }

    if (scheduledForRetry === undefined) {
      return this.createFailedResult('', errorMessage);
    }

    this.emitPublishFailedWebhook(post, errorMessage);
    return this.createFailedResult('', errorMessage);
  }

  private emitPublishPublishedWebhook(
    post: PostEntity,
    result: PublishResult,
    platform: CredentialPlatform | string,
  ): void {
    void this.publishEventWebhookService.emitLegacyPostPublished({
      externalProviderId: result.externalId ?? null,
      externalShortcode: result.externalShortcode ?? null,
      platform,
      post,
      url: result.url || null,
    });
  }

  private emitPublishFailedWebhook(
    post: PostEntity,
    errorMessage: string,
    platform?: CredentialPlatform | string,
  ): void {
    void this.publishEventWebhookService.emitLegacyPostFailed({
      errorMessage,
      platform,
      post,
    });
  }

  private isRetryableError(error: unknown): boolean {
    const retryableErrorPatterns = [
      'rate limit',
      'timeout',
      'ETIMEDOUT',
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'socket hang up',
      '429',
      '500',
      '502',
      '503',
      '504',
    ];

    const errorMessage = this.errorMessage(error).toLowerCase();
    const errorCode =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
    const normalizedErrorCode = errorCode.toLowerCase();

    return retryableErrorPatterns.some(
      (pattern) =>
        errorMessage.includes(pattern.toLowerCase()) ||
        normalizedErrorCode.includes(pattern.toLowerCase()),
    );
  }

  private async logQuotaExceededActivity(
    post: PostEntity,
    quotaCheck: QuotaCheckResult,
    platform: string,
  ): Promise<void> {
    await this.activitiesService.create(
      new ActivityEntity({
        brand: readPostString(post, ['brandId', 'brand']) ?? null,
        entityId: post.id,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_FAILED,
        organization:
          readPostString(post, ['organizationId', 'organization']) ?? null,
        source: ActivitySource.POST,
        user: readPostString(post, ['userId', 'user']) ?? null,
        value: `Quota exceeded: ${quotaCheck.currentCount}/${quotaCheck.dailyLimit} posts for ${platform}`,
      }),
    );
  }

  private async failChildren(post: PostEntity, reason: string): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const children = (post.children || []) as unknown as PostDocument[];

    if (children.length === 0) {
      return;
    }

    this.logger.log(`${url} failing ${children.length} children`, {
      childrenCount: children.length,
      parentPostId: post.id.toString(),
      reason,
    });

    for (const child of children) {
      try {
        await this.postsService.patch(child.id.toString(), {
          status: PostStatus.FAILED,
        });
      } catch (error: unknown) {
        this.logger.error(`${url} failed to mark child as failed`, {
          childPostId: child.id.toString(),
          error: (error as Error)?.message,
          parentPostId: post.id.toString(),
        });
      }
    }
  }

  private async logFailedActivity(
    post: PostEntity,
    errorMessage: string,
  ): Promise<void> {
    await this.activitiesService.create(
      new ActivityEntity({
        brand: readPostString(post, ['brandId', 'brand']) ?? null,
        entityId: post.id,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_FAILED,
        organization:
          readPostString(post, ['organizationId', 'organization']) ?? null,
        source: ActivitySource.POST,
        user: readPostString(post, ['userId', 'user']) ?? null,
        value: errorMessage,
      }),
    );
  }

  private createFailedResult(platform: string, error?: string): PublishResult {
    return {
      error,
      externalId: null,
      platform,
      status: PostStatus.FAILED,
      success: false,
      url: '',
    };
  }
}
