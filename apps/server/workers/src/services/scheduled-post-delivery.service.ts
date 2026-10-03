import { CredentialPublishingReadinessService } from '@api/collections/credentials/services/credential-publishing-readiness.service';
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
  type PublishResult,
  SERVER_TOKENS,
  type ServerCredentialStore,
  type ServerPublisherFactory,
  scopedWhere,
} from '@api/index';
import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { ReplyPostWatchService } from '@api/services/reply-bot/reply-post-watch.service';
import { PublishEventWebhookService } from '@api/services/webhook-client/publish-event-webhook.service';
import {
  CredentialPlatform,
  Platform,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
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
  getPublishErrorCode,
  getPublishErrorMessage,
  isAmbiguousPublishError,
  isRetryablePublishError,
} from '@workers/crons/posts/post-publish-error.util';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { loadScheduledActionPost } from '@workers/services/scheduled-post-action-load.util';
import type {
  DeliveryGateFailure,
  PostDeliveryIds,
  PreparedPostDelivery,
} from '@workers/services/scheduled-post-delivery.types';
import {
  readDeliveryIds,
  ScheduledPostDeliveryGates,
} from '@workers/services/scheduled-post-delivery-gates';
import {
  readScheduledDeliveryRecord,
  readScheduledDeliveryRequest,
  readScheduledDeliveryResult,
} from '@workers/services/scheduled-post-delivery-input.util';
import { ScheduledPostFailureService } from '@workers/services/scheduled-post-failure.service';
import {
  type PlannedThreadChild,
  toPlannedThreadChildren,
} from '@workers/services/scheduled-post-media-gate.util';
import { ScheduledPostProviderAttempts } from '@workers/services/scheduled-post-provider-attempts';
import {
  type ProviderPublishAttempt,
  type ProviderPublishAttemptRef,
  ProviderPublishInFlightError,
  ProviderPublishPersistenceError,
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

@Injectable()
export class ScheduledPostDeliveryService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly gates: ScheduledPostDeliveryGates;
  private readonly attempts: ScheduledPostProviderAttempts;

  constructor(
    private readonly logger: LoggerService,
    private readonly postFailureService: ScheduledPostFailureService,
    @Inject(SERVER_TOKENS.credentials)
    credentialsService: ServerCredentialStore,
    organizationsService: OrganizationsService,
    quotaService: QuotaService,
    @Inject(SERVER_TOKENS.publisherFactory)
    publisherFactory: ServerPublisherFactory,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
    private readonly replyPostWatchService: ReplyPostWatchService,
    publishingReadinessService: CredentialPublishingReadinessService,
    private readonly prisma: PrismaService,
    mediaReadinessService: MediaReadinessService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
  ) {
    this.gates = new ScheduledPostDeliveryGates(
      logger,
      credentialsService,
      organizationsService,
      quotaService,
      publisherFactory,
      publishingReadinessService,
      prisma,
      mediaReadinessService,
    );
    this.attempts = new ScheduledPostProviderAttempts(prisma, logger);
  }

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

    const ids = readDeliveryIds(post);

    try {
      // Reserve the occurrence before any gate: only the holder of a fresh
      // reservation may fail the target, so a gate can never race another
      // delivery's provider call or fail an already-published post.
      let attempt: ProviderPublishAttempt;
      try {
        attempt = await this.attempts.reserve(post, workflowExecutionId);
      } catch (error: unknown) {
        if (error instanceof ProviderPublishInFlightError) throw error;
        // Nothing reached the provider, so the normal retry path is safe.
        return await this.handlePublishError(post, error, workflowExecutionId);
      }
      if (attempt.kind === 'in_flight') {
        throw new ProviderPublishInFlightError(post.id.toString());
      }
      if (attempt.kind === 'replay') {
        // Accepted by the provider: persist it without any credential or gate.
        return await this.persistAcceptedPublish(
          post,
          attempt,
          attempt.result,
          await this.gates.loadRecoveryDelivery(post, source, ids, url),
          workflowExecutionId,
          url,
        );
      }
      return await this.publishReservedAttempt(
        post,
        source,
        ids,
        attempt,
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

  /**
   * Gate and publish a reserved attempt. A fresh reservation is released on
   * every exit before the provider call; an unconfirmed attempt is verified
   * before any gate runs.
   */
  private async publishReservedAttempt(
    post: PostEntity,
    source: ScheduledPostWorkflowInput['source'],
    ids: PostDeliveryIds,
    attempt: Extract<
      ProviderPublishAttempt,
      { kind: 'publish' | 'unconfirmed' }
    >,
    workflowExecutionId: string,
    url: string,
  ): Promise<PublishResult> {
    let held: ProviderPublishAttemptRef | null =
      attempt.kind === 'publish' ? attempt : null;
    const release = async (result: PublishResult): Promise<PublishResult> => {
      if (held) await this.attempts.settle(post, held, 'released', url);
      return result;
    };
    const fail = (failure: DeliveryGateFailure): Promise<PublishResult> =>
      this.failChannel(
        post,
        failure.platform,
        failure.code,
        failure.message,
        failure.isRetryable,
        failure.activity,
      ).then(release);
    try {
      const loaded = await this.gates.loadResources(post, ids, url);
      if (!loaded.ok) {
        return await fail(loaded.failure);
      }
      const { credential, organization } = loaded.value;
      const checkCredential = () =>
        this.gates.checkCredential(post, ids, credential, organization, url);
      if (held) {
        const failure = await checkCredential();
        if (failure) return await fail(failure);
      }

      const prepared = this.gates.prepare(
        post,
        source,
        ids,
        credential,
        organization,
        url,
      );
      if (!prepared.ok) {
        return await fail(prepared.failure);
      }
      const checkContent = () =>
        this.gates.checkContent(post, ids, prepared.value, url);

      if (attempt.kind === 'unconfirmed') {
        const resolved = await this.attempts.resolveUnconfirmed(
          post,
          prepared.value,
          attempt,
          workflowExecutionId,
          url,
        );
        if (resolved.kind === 'in_flight') {
          throw new ProviderPublishInFlightError(post.id.toString());
        }
        if (resolved.kind === 'unconfirmed') {
          // The provider could not confirm the earlier outcome yet.
          return await this.handlePublishError(
            post,
            new Error(
              'Provider publish outcome is not confirmed yet (timeout)',
            ),
            workflowExecutionId,
          );
        }
        if (resolved.kind === 'replay') {
          return await this.persistAcceptedPublish(
            post,
            resolved,
            resolved.result,
            prepared.value,
            workflowExecutionId,
            url,
          );
        }
        held = resolved;
        const failure = (await checkCredential()) ?? (await checkContent());
        if (failure) return await fail(failure);
      } else {
        const failure = await checkContent();
        if (failure) return await fail(failure);
      }

      const providerAttempt = held;
      if (!providerAttempt) {
        throw new Error('Provider publish requires a reserved attempt.');
      }
      // A holder that stalled past its lease may have been taken over by
      // another delivery: confirm the attempt is still ours right before the
      // provider call, or never call it.
      const isOwned = await this.attempts.confirmOwnership(
        post,
        providerAttempt,
      );
      held = null;
      if (!isOwned) {
        throw new ProviderPublishInFlightError(post.id.toString());
      }
      return await this.callProvider(
        post,
        prepared.value,
        providerAttempt,
        workflowExecutionId,
        url,
      );
    } catch (error: unknown) {
      // Still before the provider call: free the reservation for a retry.
      await release(createFailedPublishResult('', getErrorMessage(error)));
      throw error;
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

    // Hold the occurrence while failing it, so no delivery can reserve it and
    // reach the provider between this check and the FAILED write.
    const attempt = await this.attempts.holdForTerminalFailure(post);
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
    try {
      await this.attemptRetry(
        post,
        false,
        errorMessage,
        'publish_validation_failed',
      );
    } finally {
      if (attempt.kind === 'publish') {
        await this.attempts.settle(
          post,
          attempt,
          'released',
          `${this.constructorName} failTerminalValidation`,
        );
      }
    }
    this.emitPublishFailedWebhook(post, errorMessage);

    return createFailedPublishResult('', errorMessage);
  }

  private async callProvider(
    post: PostEntity,
    prepared: PreparedPostDelivery,
    attempt: ProviderPublishAttemptRef,
    workflowExecutionId: string,
    url: string,
  ): Promise<PublishResult> {
    let result: PublishResult;
    try {
      // The provider call itself stays in this documented workflow action
      // adapter; the attempt only renews its lease around it.
      result = await this.attempts.publishUnderLease(post, attempt, url, () =>
        prepared.publisher.publish(prepared.context),
      );
    } catch (error: unknown) {
      // A timeout or dropped connection may hide an accepted publish: keep
      // the attempt for verification on retry instead of releasing it.
      await this.attempts.settle(
        post,
        attempt,
        isAmbiguousPublishError(error) ? 'uncertain' : 'released',
        url,
      );
      return await this.handlePublishError(post, error, workflowExecutionId);
    }
    if (!result.success) {
      // A pre-publish validation code is deterministic; anything else that
      // looks like a timeout or 5xx may hide an accepted publish.
      const isAmbiguous =
        !result.errorCode && isAmbiguousPublishError(result.error ?? '');
      await this.attempts.settle(
        post,
        attempt,
        isAmbiguous ? 'uncertain' : 'released',
        url,
      );
      try {
        return await this.handlePublishFailure(
          post,
          result,
          prepared.platform,
          workflowExecutionId,
        );
      } catch (error: unknown) {
        return await this.handlePublishError(post, error, workflowExecutionId);
      }
    }
    await this.attempts.accept(post, attempt, result, url);
    return this.persistAcceptedPublish(
      post,
      attempt,
      result,
      prepared,
      workflowExecutionId,
      url,
    );
  }

  /**
   * Persist a provider-accepted result. From here a failure must never reach
   * the publish retry path, or the next attempt would publish it again.
   */
  private async persistAcceptedPublish(
    post: PostEntity,
    attempt: ProviderPublishAttemptRef,
    result: PublishResult,
    prepared: PreparedPostDelivery | null,
    workflowExecutionId: string,
    url: string,
  ): Promise<PublishResult> {
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
        receiptId: attempt.receiptId,
      });
      throw error;
    }
    if (persisted) {
      await this.attempts.markPersisted(post, attempt, url);
    }
    return result;
  }

  private async persistProviderSuccess(
    post: PostEntity,
    result: PublishResult,
    prepared: PreparedPostDelivery | null,
    workflowExecutionId: string,
    url: string,
  ): Promise<boolean> {
    const platform =
      prepared?.platform ?? readPostString(post, ['platform']) ?? '';
    const transitionGuard: SchedulerPublishTransitionGuard = {
      expectedWorkflowExecutionId: workflowExecutionId,
      priorExecutionStates: [TargetExecutionState.PUBLISHING],
    };

    if (!result.externalId) {
      this.logger.warn(`${url} provider returned no external id`, {
        platform,
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
        platform,
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
    if (prepared) {
      await this.deliverThreadChildren(
        post,
        children,
        prepared,
        result,
        publishedAt,
        url,
      );
    } else if (children.length > 0) {
      this.logger.warn(`${url} replayed publish without a publisher`, {
        childrenCount: children.length,
        postId: post.id.toString(),
      });
    }

    if (!isProviderDraft) {
      this.emitPublishPublishedWebhook(post, result, platform);
      this.scheduleReplyPostWatchAfterPublish(post, result, platform);
    }

    this.logger.log(
      `${url} ${isProviderDraft ? 'created provider draft' : 'published post successfully'}`,
      {
        childrenCount: children.length,
        externalId: result.externalId,
        platform,
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
      : isRetryablePublishError(result.error) ||
        isAmbiguousPublishError(result.error ?? '');
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
    // An ambiguous outcome must reach the soft retry that verifies it.
    const isRetryable =
      isRetryablePublishError(error) || isAmbiguousPublishError(error);
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
