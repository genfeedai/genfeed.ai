import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowInput,
} from '@api/collections/posts/services/scheduled-post-workflow-definition';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  type CredentialDocument,
  type IPublisher,
  type PublishContext,
  type PublishResult,
  SERVER_TOKENS,
  type ServerCredentialStore,
  type ServerPublisherFactory,
  scopedWhere,
  TIKTOK_APP_HANDOFF_SETTING,
  WORKFLOW_APPROVED_SCHEDULE_SETTING,
} from '@api/index';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  Platform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  resolveChannelTargetSettings,
  validateChannelTargetSettings,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { resolvePostVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  createChannelTargetError,
  createFailedPublishResult,
  createPublishFailedActivity,
  createQuotaExceededActivity,
  getPublishErrorCode,
  getPublishErrorMessage,
  isAmbiguousPublishError,
  isRetryablePublishError,
  type QuotaCheckResult,
} from '@workers/crons/posts/post-publish-error.util';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { loadScheduledActionPost } from '@workers/services/scheduled-post-action-load.util';
import {
  readScheduledDeliveryRecord,
  readScheduledDeliveryRequest,
  readScheduledDeliveryResult,
} from '@workers/services/scheduled-post-delivery-input.util';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import {
  collectMediaGateAssetIds,
  type PlannedThreadChild,
  readMediaGateOutcome,
  toPlannedThreadChildren,
  toValidationMedia,
} from '@workers/services/scheduled-post-media-gate.util';
import {
  acceptProviderPublishAttempt,
  claimProviderPublishAttempt,
  inspectProviderPublishAttempt,
  markProviderPublishAttemptUncertain,
  markProviderReceiptPersisted,
  type ProviderPublishAttempt,
  ProviderPublishInFlightError,
  ProviderPublishPersistenceError,
  releaseProviderPublishAttempt,
  reserveProviderPublishAttempt,
} from '@workers/services/scheduled-post-provider-receipt.util';
import {
  queueLearningPublicationRefreshV1,
  type SchedulerPublishFinalizationInput,
  SchedulerPublishStateService,
  type SchedulerPublishTargetUpdate,
  type SchedulerPublishTransitionGuard,
} from '@workers/services/scheduler-publish-state.service';
import {
  type DelayedThreadChild,
  planThreadChildDelivery,
} from '@workers/services/thread-comment-schedule.util';

type PostDeliveryIds = {
  brandId: string | undefined;
  credentialId: string | undefined;
  organizationId: string | undefined;
  userId: string | undefined;
};

type PreparedPostDelivery = {
  context: PublishContext;
  credential: CredentialDocument;
  platform: Platform;
  publisher: IPublisher;
};

type DeliveryLoad<T> =
  | { ok: true; value: T }
  | { ok: false; result: PublishResult };

@Injectable()
export class ScheduledPostDeliveryService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly MAX_RETRY_ATTEMPTS = 3;

  constructor(
    private readonly logger: LoggerService,
    private readonly postFailureService: ScheduledPostFailureService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly organizationsService: OrganizationsService,
    private readonly quotaService: QuotaService,
    @Inject(SERVER_TOKENS.publisherFactory)
    private readonly publisherFactory: ServerPublisherFactory,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
    private readonly replyPostWatchService: ReplyPostWatchService,
    private readonly publishingReadinessService: CredentialPublishingReadinessService,
    private readonly prisma: PrismaService,
    private readonly mediaReadinessService: MediaReadinessService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      SCHEDULED_POST_ACTION_IDS.DELIVER,
      ({ input, provenance }) =>
        this.publishAction(input, provenance.executionId),
    );
  }

  private async publishAction(
    input: Record<string, unknown>,
    workflowExecutionId: string,
  ): Promise<PublishResult> {
    const request = readScheduledDeliveryRequest(input.request);
    const claim = readScheduledDeliveryRecord(input.claim);
    if (claim.isAlreadyPublished === true) {
      return readScheduledDeliveryResult(claim.publishedResult);
    }
    const post = await loadScheduledActionPost(this.prisma, request);
    if (!post) {
      throw new Error(
        `Scheduled post ${request.postId} is no longer publishable`,
      );
    }
    return this.publishSinglePostAction(
      post,
      request.source,
      workflowExecutionId,
    );
  }

  private async publishSinglePostAction(
    post: PostEntity,
    source: ScheduledPostWorkflowInput['source'],
    workflowExecutionId: string,
  ): Promise<PublishResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    await this.persistPublishState(post, {
      error: null,
      executionState: TargetExecutionState.PUBLISHING,
      lastAttemptAt: new Date(),
    });

    const ids = this.readDeliveryIds(post);

    try {
      // A provider-accepted occurrence only needs its state persisted: the
      // readiness, quota and media gates must not fail an already-published post.
      const isReplay =
        (
          await inspectProviderPublishAttempt(
            this.prisma,
            post,
            workflowExecutionId,
          )
        ).kind === 'replay';
      const loaded = await this.loadPublishResources(post, ids, url, isReplay);
      if (!loaded.ok) {
        return loaded.result;
      }

      const prepared = await this.preparePublisherAndContext(
        post,
        source,
        ids,
        loaded.value.credential,
        loaded.value.organization,
        url,
        isReplay,
      );
      if (!prepared.ok) {
        return prepared.result;
      }

      return await this.executeProviderPublish(
        post,
        prepared.value,
        workflowExecutionId,
        url,
      );
    } catch (error: unknown) {
      if (
        error instanceof ProviderPublishPersistenceError ||
        error instanceof ProviderPublishInFlightError
      )
        throw error;
      return await this.handlePublishError(post, error);
    }
  }

  async failTerminalValidation(
    post: PostEntity,
    error: unknown,
  ): Promise<PublishResult> {
    const errorMessage = getErrorMessage(error, {
      fallback: () => 'Publish validation failed',
      messageSource: 'error-instance',
    });

    const attempt = await inspectProviderPublishAttempt(
      this.prisma,
      post,
      null,
    );
    if (attempt.kind === 'replay' || attempt.kind === 'in_flight') {
      // The provider accepted this occurrence, or another delivery is
      // publishing it: keep the target PUBLISHING for replay, never FAILED.
      this.logger.warn('Kept provider publish attempt for replay', {
        attempt: attempt.kind,
        error: errorMessage,
        postId: post.id,
        receiptId: attempt.receiptId,
      });
      return attempt.kind === 'replay'
        ? { ...attempt.result, executionState: TargetExecutionState.PUBLISHING }
        : {
            ...createFailedPublishResult('', errorMessage),
            executionState: TargetExecutionState.PUBLISHING,
          };
    }

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

    return createFailedPublishResult('', errorMessage);
  }

  private readDeliveryIds(post: PostEntity): PostDeliveryIds {
    return {
      brandId: readPostString(post, ['brandId']),
      credentialId: readPostString(post, ['credentialId']),
      organizationId: readPostString(post, ['organizationId']),
      userId: readPostString(post, ['userId']),
    };
  }

  private async loadPublishResources(
    post: PostEntity,
    ids: PostDeliveryIds,
    url: string,
    isReplay: boolean,
  ): Promise<
    DeliveryLoad<{
      credential: CredentialDocument;
      organization: OrganizationDocument;
    }>
  > {
    const credential = await this.loadCredential(post, ids, url);
    if (!credential.ok) {
      return credential;
    }

    const organization = await this.loadOrganization(post, ids, url);
    if (!organization.ok) {
      return organization;
    }

    if (!isReplay) {
      const readinessFailure = await this.assertChannelReady(
        post,
        ids,
        credential.value,
        url,
      );
      if (readinessFailure) {
        return { ok: false, result: readinessFailure };
      }

      const quotaFailure = await this.assertQuotaAllowed(
        post,
        credential.value,
        organization.value,
        url,
      );
      if (quotaFailure) {
        return { ok: false, result: quotaFailure };
      }
    }

    return {
      ok: true,
      value: {
        credential: credential.value,
        organization: organization.value,
      },
    };
  }

  private async loadCredential(
    post: PostEntity,
    ids: PostDeliveryIds,
    url: string,
  ): Promise<DeliveryLoad<CredentialDocument>> {
    const credential = (await this.credentialsService.findOne({
      id: ids.credentialId,
      isDeleted: false,
      ...(ids.organizationId ? { organizationId: ids.organizationId } : {}),
    })) as CredentialDocument | null;

    if (!credential) {
      this.logger.error(`${url} credential not found`, { postId: post.id });
      return {
        ok: false,
        result: await this.failChannel(
          post,
          '',
          'credential_not_found',
          'Credential not found',
          false,
        ),
      };
    }

    return { ok: true, value: credential };
  }

  private async loadOrganization(
    post: PostEntity,
    ids: PostDeliveryIds,
    url: string,
  ): Promise<DeliveryLoad<OrganizationDocument>> {
    const organization = (await this.organizationsService.findOne({
      id: ids.organizationId,
      isDeleted: false,
    })) as OrganizationDocument | null;

    if (!organization) {
      this.logger.error(`${url} organization not found`, {
        postId: post.id,
      });
      return {
        ok: false,
        result: await this.failChannel(
          post,
          '',
          'organization_not_found',
          'Organization not found',
          false,
        ),
      };
    }

    return { ok: true, value: organization };
  }

  private async assertChannelReady(
    post: PostEntity,
    ids: PostDeliveryIds,
    credential: CredentialDocument,
    url: string,
  ): Promise<PublishResult | null> {
    const readiness = (
      await this.publishingReadinessService.resolveForCredentials(
        this.prisma,
        ids.organizationId ?? '',
        [ids.credentialId ?? ''],
      )
    ).get(ids.credentialId ?? '');

    if (readiness?.canSchedule) {
      return null;
    }

    const blocking = readiness?.diagnostics.find(
      (diagnostic) => diagnostic.severity === 'error',
    );
    const readinessError =
      blocking?.message ?? 'Channel is not ready to publish';

    this.logger.error(`${url} channel not ready to publish`, {
      classification: blocking?.classification,
      credentialId: ids.credentialId,
      platform: credential.platform,
      postId: post.id,
      readinessState: readiness?.state ?? 'unresolved',
    });

    return this.failChannel(
      post,
      this.toDomainPlatform(credential.platform),
      blocking?.code ?? 'channel_not_ready',
      readinessError,
      readiness?.isRetryable ?? false,
    );
  }

  private async assertQuotaAllowed(
    post: PostEntity,
    credential: CredentialDocument,
    organization: OrganizationDocument,
    url: string,
  ): Promise<PublishResult | null> {
    const quotaCheck = (await this.quotaService.checkQuota(
      credential,
      organization,
    )) as QuotaCheckResult;
    if (quotaCheck.allowed) {
      return null;
    }

    this.logger.warn(`${url} quota exceeded for ${credential.platform}`, {
      currentCount: quotaCheck.currentCount,
      dailyLimit: quotaCheck.dailyLimit,
      platform: credential.platform,
      postId: post.id,
    });

    const platform = this.toDomainPlatform(credential.platform);
    return this.failChannel(
      post,
      platform,
      'quota_exceeded',
      'Quota exceeded',
      false,
      createQuotaExceededActivity(post, quotaCheck, platform),
    );
  }

  private async preparePublisherAndContext(
    post: PostEntity,
    source: ScheduledPostWorkflowInput['source'],
    ids: PostDeliveryIds,
    credential: CredentialDocument,
    organization: OrganizationDocument,
    url: string,
    isReplay: boolean,
  ): Promise<DeliveryLoad<PreparedPostDelivery>> {
    const platform = fromPrismaCredentialPlatform(
      String(credential.platform ?? ''),
    );
    if (!platform) {
      const unknownPlatform = String(credential.platform ?? '');
      this.logger.error(`${url} unsupported platform`, {
        platform: unknownPlatform,
        postId: post.id,
      });
      return {
        ok: false,
        result: await this.failChannel(
          post,
          unknownPlatform,
          'unsupported_platform',
          'Unsupported platform',
          false,
        ),
      };
    }

    const publisher = this.publisherFactory.getPublisher(platform);
    if (!publisher) {
      this.logger.error(`${url} unsupported platform`, {
        platform: credential.platform,
        postId: post.id,
      });
      return {
        ok: false,
        result: await this.failChannel(
          post,
          platform,
          'unsupported_platform',
          'Unsupported platform',
          false,
        ),
      };
    }

    const resolvedSettings = resolveChannelTargetSettings(
      platform,
      post.targetSettings,
    );
    const visibility = resolvePostVisibility(post.visibility);
    const targetValidation = validateChannelTargetSettings({
      caption: post.description,
      credentialId: ids.credentialId ?? undefined,
      media: toValidationMedia(post),
      platform,
      publishMode: 'publish_now',
      settings: resolvedSettings,
      visibility,
    });
    if (!isReplay && !targetValidation.valid) {
      const validationError =
        targetValidation.errors[0]?.message ??
        'Channel target validation failed';
      return {
        ok: false,
        result: await this.failChannel(
          post,
          platform,
          'channel_target_invalid',
          validationError,
          false,
        ),
      };
    }

    const mediaBlock = isReplay
      ? null
      : await this.assertMediaReady(post, ids, platform, url);
    if (mediaBlock) {
      return { ok: false, result: mediaBlock };
    }

    const settings =
      source === 'tiktok_app'
        ? {
            ...resolvedSettings,
            [TIKTOK_APP_HANDOFF_SETTING]: true,
          }
        : platform === CredentialPlatform.BEEHIIV &&
            source !== 'publish_now' &&
            post.scheduledDate instanceof Date
          ? {
              ...resolvedSettings,
              [WORKFLOW_APPROVED_SCHEDULE_SETTING]:
                post.scheduledDate.toISOString(),
            }
          : resolvedSettings;

    return {
      ok: true,
      value: {
        context: {
          brandId: ids.brandId ?? '',
          credential,
          organization,
          organizationId: ids.organizationId ?? '',
          post,
          postId: post.id.toString(),
          settings,
          visibility,
        },
        credential,
        platform,
        publisher,
      },
    };
  }

  /**
   * Deterministic media readiness gate (#4878).
   *
   * The last check before `executeProviderPublish`, so an asset that breaks
   * the target platform's published media spec is reported as a channel
   * failure instead of bouncing back as a provider error. `warning`
   * diagnostics are recorded and let the publish proceed.
   */
  private async assertMediaReady(
    post: PostEntity,
    ids: PostDeliveryIds,
    platform: Platform,
    url: string,
  ): Promise<PublishResult | null> {
    const assetIds = collectMediaGateAssetIds(post);
    if (assetIds.length === 0) {
      return null;
    }

    const outcome = readMediaGateOutcome(
      await this.mediaReadinessService.evaluatePublishReadiness({
        assetIds,
        organizationId: ids.organizationId ?? '',
        platforms: [platform],
      }),
    );
    const context = { platform, postId: post.id };
    if (outcome.warnings.length > 0) {
      this.logger.warn(`${url} media readiness warnings`, {
        ...context,
        diagnostics: outcome.warnings,
      });
    }
    if (outcome.blockers.length === 0) {
      return null;
    }

    this.logger.error(`${url} media readiness blocked publish`, {
      ...context,
      diagnostics: outcome.blockers,
    });
    return this.failChannel(
      post,
      platform,
      outcome.code,
      outcome.message,
      false,
    );
  }

  private async executeProviderPublish(
    post: PostEntity,
    prepared: PreparedPostDelivery,
    workflowExecutionId: string,
    url: string,
  ): Promise<PublishResult> {
    let attempt: ProviderPublishAttempt;
    try {
      attempt = await reserveProviderPublishAttempt(
        this.prisma,
        post,
        workflowExecutionId,
      );
      if (attempt.kind === 'unconfirmed') {
        attempt = await this.resolveUnconfirmedAttempt(
          post,
          prepared,
          attempt,
          workflowExecutionId,
          url,
        );
      }
    } catch (error: unknown) {
      if (error instanceof ProviderPublishInFlightError) throw error;
      // Nothing reached the provider, so the normal retry path is safe.
      return await this.handlePublishError(post, error, workflowExecutionId);
    }
    if (attempt.kind === 'in_flight') {
      throw new ProviderPublishInFlightError(post.id.toString());
    }
    if (attempt.kind === 'unconfirmed') {
      // The provider could not confirm the earlier outcome yet: retry later.
      return await this.handlePublishError(
        post,
        new Error('Provider publish outcome is not confirmed yet (timeout)'),
        workflowExecutionId,
      );
    }
    const receiptId = attempt.receiptId;

    let result: PublishResult;
    if (attempt.kind === 'replay') {
      result = attempt.result;
      this.logger.warn(`${url} replaying recorded provider publish`, {
        externalId: result.externalId,
        postId: post.id.toString(),
        receiptId,
      });
    } else {
      try {
        result = await prepared.publisher.publish(prepared.context);
      } catch (error: unknown) {
        // A timeout or dropped connection may hide an accepted publish: keep
        // the attempt for verification on retry instead of releasing it.
        if (isAmbiguousPublishError(error))
          await this.settleProviderAttempt(post, receiptId, 'uncertain', url);
        else await this.settleProviderAttempt(post, receiptId, 'released', url);
        return await this.handlePublishError(post, error, workflowExecutionId);
      }
      if (!result.success) {
        await this.settleProviderAttempt(post, receiptId, 'released', url);
        try {
          return await this.handlePublishFailure(
            post,
            result,
            prepared.platform,
            workflowExecutionId,
          );
        } catch (error: unknown) {
          return await this.handlePublishError(
            post,
            error,
            workflowExecutionId,
          );
        }
      }
      await this.acceptProviderAttempt(post, receiptId, result, url);
    }

    // The provider accepted the post: from here a failure must never reach
    // the publish retry path, or the next attempt would publish it again.
    let persisted: boolean;
    try {
      persisted = await this.persistProviderSuccess(
        post,
        result,
        prepared,
        workflowExecutionId,
        url,
      );
    } catch (error: unknown) {
      if (!(error instanceof ProviderPublishPersistenceError)) {
        return await this.handlePublishError(post, error, workflowExecutionId);
      }
      this.logger.error(`${url} provider publish persistence failed`, {
        error: getErrorMessage(error.cause),
        externalId: result.externalId,
        postId: post.id.toString(),
        receiptId,
      });
      throw error;
    }
    if (persisted) {
      await markProviderReceiptPersisted(this.prisma, post, receiptId).catch(
        (error: unknown) =>
          this.logger.warn(`${url} provider receipt persistence not marked`, {
            error: getErrorMessage(error),
            postId: post.id.toString(),
            receiptId,
          }),
      );
    }
    return result;
  }

  /**
   * Resolve an earlier attempt whose provider outcome was never confirmed.
   * Publishers that can verify report whether it landed; a confirmed absence
   * (or a publisher without verification) reclaims the attempt for a retry.
   */
  private async resolveUnconfirmedAttempt(
    post: PostEntity,
    prepared: PreparedPostDelivery,
    attempt: Extract<ProviderPublishAttempt, { kind: 'unconfirmed' }>,
    workflowExecutionId: string,
    url: string,
  ): Promise<ProviderPublishAttempt> {
    const verify = prepared.publisher.verifyPublished?.bind(prepared.publisher);
    if (verify) {
      let found: PublishResult | null;
      try {
        found = await verify(prepared.context, attempt.attemptStartedAt);
      } catch (error: unknown) {
        this.logger.warn(`${url} provider publish verification unavailable`, {
          error: getErrorMessage(error),
          postId: post.id.toString(),
          receiptId: attempt.receiptId,
        });
        return attempt;
      }
      if (found?.success) {
        this.logger.warn(`${url} verified an unconfirmed provider publish`, {
          externalId: found.externalId,
          postId: post.id.toString(),
          receiptId: attempt.receiptId,
        });
        await acceptProviderPublishAttempt(
          this.prisma,
          post,
          attempt.receiptId,
          found,
        );
        return { kind: 'replay', receiptId: attempt.receiptId, result: found };
      }
    }
    const isClaimed = await claimProviderPublishAttempt(
      this.prisma,
      post,
      attempt.receiptId,
      attempt.status,
      workflowExecutionId,
    );
    if (!isClaimed) return { kind: 'in_flight', receiptId: attempt.receiptId };
    this.logger.warn(`${url} retrying an unconfirmed provider publish`, {
      isVerified: Boolean(verify),
      postId: post.id.toString(),
      receiptId: attempt.receiptId,
    });
    return { kind: 'publish', receiptId: attempt.receiptId };
  }

  private async acceptProviderAttempt(
    post: PostEntity,
    receiptId: string,
    result: PublishResult,
    url: string,
  ): Promise<void> {
    // If this write fails the attempt stays unconfirmed, and the next
    // delivery verifies it with the provider before publishing again.
    await acceptProviderPublishAttempt(
      this.prisma,
      post,
      receiptId,
      result,
    ).catch((error: unknown) =>
      this.logger.error(`${url} provider publish receipt not recorded`, {
        error: getErrorMessage(error),
        externalId: result.externalId,
        postId: post.id.toString(),
        receiptId,
      }),
    );
  }

  private async settleProviderAttempt(
    post: PostEntity,
    receiptId: string,
    outcome: 'uncertain' | 'released',
    url: string,
  ): Promise<void> {
    const settle =
      outcome === 'uncertain'
        ? markProviderPublishAttemptUncertain
        : releaseProviderPublishAttempt;
    await settle(this.prisma, post, receiptId).catch((error: unknown) =>
      this.logger.error(`${url} provider publish attempt not settled`, {
        error: getErrorMessage(error),
        outcome,
        postId: post.id.toString(),
        receiptId,
      }),
    );
  }

  private async persistProviderSuccess(
    post: PostEntity,
    result: PublishResult,
    prepared: PreparedPostDelivery,
    workflowExecutionId: string,
    url: string,
  ): Promise<boolean> {
    const transitionGuard: SchedulerPublishTransitionGuard = {
      expectedWorkflowExecutionId: workflowExecutionId,
      priorExecutionStates: [TargetExecutionState.PUBLISHING],
    };

    if (!result.externalId) {
      this.logger.warn(`${url} provider returned no external id`, {
        platform: prepared.credential.platform,
        postId: post.id.toString(),
      });
    }

    if (result.executionState === TargetExecutionState.PUBLISHING) {
      const persisted = await this.persistAcceptedPublishState(
        result,
        post,
        {
          error: null,
          executionState: TargetExecutionState.PUBLISHING,
          externalId: result.externalId,
          url: result.url || null,
          workflowExecutionId,
        },
        undefined,
        transitionGuard,
      );
      if (!persisted) {
        return false;
      }

      this.logger.log(`${url} post marked PENDING for deferred verification`, {
        platform: prepared.credential.platform,
        postId: post.id.toString(),
        publishId: result.externalId,
      });
      return true;
    }

    const isProviderDraft = result.isProviderDraft === true;
    const publishedAt = new Date();
    const persisted = await this.persistAcceptedPublishState(
      result,
      post,
      {
        error: null,
        executionState: TargetExecutionState.PUBLISHED,
        externalId: result.externalId,
        externalShortcode: result.externalShortcode ?? null,
        visibility: resolvePostVisibility(post.visibility),
        ...(!isProviderDraft
          ? { publicationDate: publishedAt, publishedAt }
          : {}),
        url: result.url || null,
        workflowExecutionId,
      },
      undefined,
      transitionGuard,
      !isProviderDraft &&
        result.externalId?.trim() &&
        resolvePostVisibility(post.visibility) === PostVisibility.PUBLIC &&
        result.executionState === TargetExecutionState.PUBLISHED
        ? {
            result: { ...result },
            source: 'ScheduledPostDeliveryService.persistProviderSuccess',
          }
        : undefined,
    );
    if (!persisted) {
      return false;
    }

    const children = (post.children || []) as unknown as PostDocument[];
    await this.deliverThreadChildren(
      post,
      children,
      prepared,
      result,
      publishedAt,
      url,
    );

    if (!isProviderDraft) {
      this.emitPublishPublishedWebhook(post, result, prepared.platform);
      this.scheduleReplyPostWatchAfterPublish(post, result, prepared.platform);
    }

    this.logger.log(
      `${url} ${isProviderDraft ? 'created provider draft' : 'published post successfully'}`,
      {
        childrenCount: children.length,
        externalId: result.externalId,
        platform: prepared.credential.platform,
        postId: post.id.toString(),
      },
    );

    return true;
  }

  /**
   * Persist a provider-accepted publish. A failure is surfaced as
   * ProviderPublishPersistenceError so no caller treats it as a publish error.
   */
  private async persistAcceptedPublishState(
    result: PublishResult,
    ...args: Parameters<ScheduledPostDeliveryService['persistPublishState']>
  ): Promise<boolean> {
    try {
      return await this.persistPublishState(...args);
    } catch (error: unknown) {
      throw new ProviderPublishPersistenceError(
        args[0].id.toString(),
        result.externalId,
        error,
      );
    }
  }

  /**
   * Send the follow-ups that go out with the parent and park the rest.
   *
   * A delayed comment keeps its SCHEDULED state and gains a due date; the
   * thread-comment sweep publishes it once that time arrives, using the same
   * publisher against the parent's provider id.
   */
  private async deliverThreadChildren(
    post: PostEntity,
    children: PostDocument[],
    prepared: PreparedPostDelivery,
    result: PublishResult,
    publishedAt: Date,
    url: string,
  ): Promise<void> {
    if (children.length === 0) {
      return;
    }

    const plan = planThreadChildDelivery(
      toPlannedThreadChildren(children),
      publishedAt,
    );

    await this.parkDelayedThreadChildren(post, plan.delayed, url);

    await this.publishThreadChildrenIfSupported(
      post,
      plan.immediate.map((entry) => entry.child),
      prepared,
      result,
      url,
    );
  }

  private async parkDelayedThreadChildren(
    post: PostEntity,
    delayed: Array<DelayedThreadChild<PlannedThreadChild>>,
    url: string,
  ): Promise<void> {
    if (delayed.length === 0) {
      return;
    }

    const organizationId = readPostString(post, ['organizationId']);
    if (!organizationId) {
      this.logger.error(`${url} cannot park delayed comments without an org`, {
        postId: post.id.toString(),
      });
      return;
    }

    for (const entry of delayed) {
      await this.prisma.post.updateMany({
        data: { scheduledDate: entry.dueAt },
        where: scopedWhere(organizationId, {
          id: entry.child.id,
          isDeleted: false,
        }),
      });
    }

    this.logger.log(`${url} parked delayed comments`, {
      delayedCount: delayed.length,
      nextDueAt: delayed[0]?.dueAt.toISOString(),
      postId: post.id.toString(),
    });
  }

  private async publishThreadChildrenIfSupported(
    post: PostEntity,
    children: PostDocument[],
    prepared: PreparedPostDelivery,
    result: PublishResult,
    url: string,
  ): Promise<void> {
    if (
      children.length === 0 ||
      !prepared.publisher.supportsThreads ||
      !result.externalId
    ) {
      return;
    }

    if (!prepared.publisher.publishThreadChildren) {
      this.logger.warn(
        `${url} platform supports threads but publishThreadChildren not implemented`,
        {
          childrenCount: children.length,
          platform: prepared.credential.platform,
          postId: post.id.toString(),
        },
      );
      return;
    }

    try {
      await prepared.publisher.publishThreadChildren(
        prepared.context,
        children,
        result.externalId,
      );
    } catch (error: unknown) {
      const errorMessage = getPublishErrorMessage(error);
      this.logger.error(
        `${url} failed to publish thread children after parent success`,
        {
          childrenCount: children.length,
          error: errorMessage,
          externalId: result.externalId,
          platform: prepared.credential.platform,
          postId: post.id.toString(),
        },
      );
      await this.postFailureService.failChildren(
        post,
        getPublishErrorCode(error),
        errorMessage,
      );
    }
  }

  private async persistPublishState(
    post: PostEntity,
    update: SchedulerPublishTargetUpdate,
    reason?: string,
    guard?: SchedulerPublishTransitionGuard,
    finalization?: SchedulerPublishFinalizationInput,
  ): Promise<boolean> {
    const handled = finalization
      ? await this.schedulerPublishStateService.transitionPost(
          post,
          update,
          reason,
          guard,
          finalization,
        )
      : await this.schedulerPublishStateService.transitionPost(
          post,
          update,
          reason,
          guard,
        );
    if (handled) {
      await queueLearningPublicationRefreshV1(this.workflowQueue, this.logger, {
        organizationId: readPostString(post, ['organizationId']) ?? '',
        credentialId: readPostString(post, ['credentialId']) ?? null,
      });

      return true;
    }

    this.logger.warn('Skipped stale or unauthorized publish transition', {
      expectedWorkflowExecutionId: guard?.expectedWorkflowExecutionId,
      postId: post.id.toString(),
      requestedState: update.executionState,
    });
    return false;
  }

  /**
   * Terminal pre-provider failure. The owner is told through the same
   * POST_FAILED activity as an exhausted provider retry (#5187); only the
   * transition that actually moved the target to FAILED notifies.
   */
  private async failChannel(
    post: PostEntity,
    platform: string,
    code: string,
    message: string,
    isRetryable: boolean,
    activity: RecordActivityInput = createPublishFailedActivity(post, message),
  ): Promise<PublishResult> {
    const persisted = await this.persistPublishState(
      post,
      {
        error: createChannelTargetError(code, message, isRetryable),
        executionState: TargetExecutionState.FAILED,
      },
      message,
    );
    if (persisted) {
      await this.postFailureService.failChildren(
        post,
        'parent_failed',
        'Parent post failed',
      );
      await this.postFailureService.notifyPublishFailed(post, activity);
      this.emitPublishFailedWebhook(post, message, platform || undefined);
    }
    return createFailedPublishResult(platform, message);
  }

  private async attemptRetry(
    post: PostEntity,
    canRetry: boolean,
    errorMessage: string,
    errorCode = getPublishErrorCode(errorMessage),
    workflowExecutionId?: string,
  ): Promise<boolean | undefined> {
    const url = `${this.constructorName} attemptRetry`;
    const currentRetryCount = post.retryCount || 0;

    if (canRetry) {
      const targetError = createChannelTargetError(
        errorCode,
        errorMessage,
        true,
      );
      const persisted = await this.persistPublishState(
        post,
        {
          error: targetError,
          executionState: TargetExecutionState.SCHEDULED,
          lastAttemptAt: new Date(),
          retryCount: currentRetryCount + 1,
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

    const persisted = await this.persistPublishState(
      post,
      {
        error: createChannelTargetError(errorCode, errorMessage, false),
        executionState: TargetExecutionState.FAILED,
        lastAttemptAt: new Date(),
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
    await this.postFailureService.failChildren(
      post,
      'parent_failed',
      'Parent post failed',
    );
    await this.postFailureService.notifyPublishFailed(
      post,
      createPublishFailedActivity(post, errorMessage),
    );

    return false;
  }

  private async handlePublishFailure(
    post: PostEntity,
    result: PublishResult,
    platform: CredentialPlatform | string,
    workflowExecutionId?: string,
  ): Promise<PublishResult> {
    const currentRetryCount = post.retryCount || 0;
    const isRetryable = result.errorCode
      ? false
      : isRetryablePublishError(result.error);
    const canRetry = isRetryable && currentRetryCount < this.MAX_RETRY_ATTEMPTS;
    const errorMessage = result.error || 'Max retries reached';

    const scheduledForRetry = await this.attemptRetry(
      post,
      canRetry,
      errorMessage,
      result.errorCode ?? getPublishErrorCode(result.error),
      workflowExecutionId,
    );

    if (scheduledForRetry) {
      return {
        externalId: null,
        executionState: TargetExecutionState.SCHEDULED,
        platform,
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
    const isRetryable = isRetryablePublishError(error);
    const canRetry = isRetryable && currentRetryCount < this.MAX_RETRY_ATTEMPTS;
    const errorMessage = getPublishErrorMessage(error);

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
      getPublishErrorCode(error),
      workflowExecutionId,
    );

    if (scheduledForRetry) {
      return {
        externalId: null,
        executionState: TargetExecutionState.SCHEDULED,
        platform: '',
        success: false,
        url: '',
      };
    }

    if (scheduledForRetry === undefined) {
      return createFailedPublishResult('', errorMessage);
    }

    this.emitPublishFailedWebhook(post, errorMessage);
    return createFailedPublishResult('', errorMessage);
  }

  private toDomainPlatform(
    platform: CredentialDocument['platform'] | string | null | undefined,
  ): string {
    return (
      fromPrismaCredentialPlatform(String(platform ?? '')) ??
      String(platform ?? '')
    );
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

  private scheduleReplyPostWatchAfterPublish(
    post: PostEntity,
    result: PublishResult,
    platform: CredentialPlatform | string,
  ): void {
    const platformKey = String(platform).toLowerCase();
    const isX =
      platformKey === 'twitter' ||
      platformKey === CredentialPlatform.TWITTER.toLowerCase() ||
      platform === CredentialPlatform.TWITTER;
    const isYouTube =
      platformKey === 'youtube' ||
      platformKey === CredentialPlatform.YOUTUBE.toLowerCase() ||
      platform === CredentialPlatform.YOUTUBE;
    if ((!isX && !isYouTube) || !result.externalId) {
      return;
    }

    const organizationId = post.organizationId;
    const brandId = post.brandId;
    if (!organizationId || !brandId) {
      return;
    }

    const postPreview =
      readPostString(post, ['title']) ||
      readPostString(post, ['text']) ||
      readPostString(post, ['content']) ||
      undefined;
    const watchPlatform = isYouTube ? Platform.YOUTUBE : Platform.TWITTER;

    void this.replyPostWatchService
      .schedulePostWatch({
        brandId: String(brandId),
        organizationId: String(organizationId),
        platform: watchPlatform,
        postId: result.externalId,
        postPreview: postPreview?.slice(0, 200),
      })
      .then((scheduled) => {
        this.logger.log(
          `${this.constructorName} scheduled reply post-watch after publish`,
          {
            externalId: result.externalId,
            platform: watchPlatform,
            postId: post.id.toString(),
            scheduled: scheduled.scheduled,
          },
        );
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `${this.constructorName} failed to schedule reply post-watch`,
          {
            error: getErrorMessage(error, {
              fallback: () => 'unknown',
              messageSource: 'error-instance',
            }),
            externalId: result.externalId,
            postId: post.id.toString(),
          },
        );
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
}
