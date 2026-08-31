import { postExecutionStateReadFilter } from '@api-types/contracts';
import {
  resolveChannelTargetSettings,
  validateChannelTargetSettings,
} from '@api-types/contracts/channel-capabilities.contract';
import { resolvePostVisibility } from '@api-types/contracts/scheduler.contract';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  Platform,
  TargetExecutionState,
} from '@genfeedai/enums';
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
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ActivitiesService } from '@server/collections/activities/services/activities.service';
import { CredentialPublishingReadinessService } from '@server/collections/credentials/services/credential-publishing-readiness.service';
import type { OrganizationDocument } from '@server/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@server/collections/organizations/services/organizations.service';
import { PostEntity } from '@server/collections/posts/entities/post.entity';
import type { PostDocument } from '@server/collections/posts/post.schema';
import { PostsService } from '@server/collections/posts/services/posts.service';
import {
  SCHEDULED_POST_ACTION_IDS,
  type ScheduledPostWorkflowInput,
} from '@server/collections/posts/services/scheduled-post-workflow-definition';
import { SystemWorkflowRunnerService } from '@server/collections/workflows/system-workflow-runner.service';
import { QuotaService } from '@server/services/quota/quota.service';
import { ReplyPostWatchService } from '@server/services/reply-bot/reply-post-watch.service';
import { PublishEventWebhookService } from '@server/services/webhook-client/publish-event-webhook.service';
import {
  createChannelTargetError,
  createFailedPublishResult,
  createPublishFailedActivity,
  createQuotaExceededActivity,
  getPublishErrorCode,
  getPublishErrorMessage,
  isRetryablePublishError,
  type QuotaCheckResult,
} from '@workers/crons/posts/post-publish-error.util';
import { SCHEDULED_POST_RETRY_BACKOFF_SECONDS } from '@workers/services/scheduled-post.constants';
import { readPostString } from '@workers/services/scheduled-post.utils';
import {
  SchedulerPublishStateService,
  type SchedulerPublishTargetUpdate,
  type SchedulerPublishTransitionGuard,
} from '@workers/services/scheduler-publish-state.service';

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
    private readonly activitiesService: ActivitiesService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly organizationsService: OrganizationsService,
    private readonly postsService: PostsService,
    private readonly quotaService: QuotaService,
    @Inject(SERVER_TOKENS.publisherFactory)
    private readonly publisherFactory: ServerPublisherFactory,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly publishEventWebhookService: PublishEventWebhookService,
    private readonly schedulerPublishStateService: SchedulerPublishStateService,
    private readonly replyPostWatchService: ReplyPostWatchService,
    private readonly publishingReadinessService: CredentialPublishingReadinessService,
    private readonly prisma: PrismaService,
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
    const request = this.readActionRequest(input.request);
    const claim = this.readRecord(input.claim);
    if (claim.isAlreadyPublished === true) {
      return this.readPublishResult(claim.publishedResult);
    }
    const post = await this.loadActionPost(request);
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
      const loaded = await this.loadPublishResources(post, ids, url);
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
      return await this.handlePublishError(post, error);
    }
  }

  private async loadActionPost(
    input: ScheduledPostWorkflowInput,
  ): Promise<PostEntity | null> {
    const post = await this.prisma.post.findFirst({
      include: {
        children: {
          include: { credential: true, ingredients: true },
          where: {
            isDeleted: false,
            ...postExecutionStateReadFilter(TargetExecutionState.SCHEDULED),
          },
        },
        ingredients: true,
      },
      where: scopedWhere(input.organizationId, {
        id: input.postId,
        parentId: null,
        ...postExecutionStateReadFilter([
          TargetExecutionState.SCHEDULED,
          TargetExecutionState.PUBLISHING,
        ]),
      }),
    });
    return post as unknown as PostEntity | null;
  }

  async failTerminalValidation(
    post: PostEntity,
    error: unknown,
  ): Promise<PublishResult> {
    const errorMessage = getErrorMessage(error, {
      fallback: () => 'Publish validation failed',
      messageSource: 'error-instance',
    });

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

    await this.persistPublishState(
      post,
      {
        error: createChannelTargetError(
          'quota_exceeded',
          'Quota exceeded',
          false,
        ),
        executionState: TargetExecutionState.FAILED,
      },
      'Quota exceeded',
    );
    const platform = this.toDomainPlatform(credential.platform);
    await this.activitiesService.create(
      createQuotaExceededActivity(post, quotaCheck, platform),
    );
    this.emitPublishFailedWebhook(post, 'Quota exceeded', platform);
    return createFailedPublishResult(platform, 'Quota exceeded');
  }

  private async preparePublisherAndContext(
    post: PostEntity,
    source: ScheduledPostWorkflowInput['source'],
    ids: PostDeliveryIds,
    credential: CredentialDocument,
    organization: OrganizationDocument,
    url: string,
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
      platform,
      publishMode: 'publish_now',
      settings: resolvedSettings,
      visibility,
    });
    if (!targetValidation.valid) {
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

  private async executeProviderPublish(
    post: PostEntity,
    prepared: PreparedPostDelivery,
    workflowExecutionId: string,
    url: string,
  ): Promise<PublishResult> {
    try {
      const result = await prepared.publisher.publish(prepared.context);

      if (result.success) {
        return await this.persistProviderSuccess(
          post,
          result,
          prepared,
          workflowExecutionId,
          url,
        );
      }

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

  private async persistProviderSuccess(
    post: PostEntity,
    result: PublishResult,
    prepared: PreparedPostDelivery,
    workflowExecutionId: string,
    url: string,
  ): Promise<PublishResult> {
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
      const persisted = await this.persistPublishState(
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
        return result;
      }

      this.logger.log(`${url} post marked PENDING for deferred verification`, {
        platform: prepared.credential.platform,
        postId: post.id.toString(),
        publishId: result.externalId,
      });
      return result;
    }

    const isProviderDraft = result.isProviderDraft === true;
    const publishedAt = new Date();
    const persisted = await this.persistPublishState(
      post,
      {
        error: null,
        executionState: TargetExecutionState.PUBLISHED,
        externalId: result.externalId,
        externalShortcode: result.externalShortcode ?? null,
        ...(!isProviderDraft
          ? { publicationDate: publishedAt, publishedAt }
          : {}),
        url: result.url || null,
        workflowExecutionId,
      },
      undefined,
      transitionGuard,
    );
    if (!persisted) {
      return result;
    }

    const children = (post.children || []) as unknown as PostDocument[];
    await this.publishThreadChildrenIfSupported(
      post,
      children,
      prepared,
      result,
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

    return result;
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
      await this.failChildren(post, errorMessage);
    }
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

    this.logger.warn('Skipped stale or unauthorized publish transition', {
      expectedWorkflowExecutionId: guard?.expectedWorkflowExecutionId,
      postId: post.id.toString(),
      requestedState: update.executionState,
    });
    return false;
  }

  private async failChannel(
    post: PostEntity,
    platform: string,
    code: string,
    message: string,
    isRetryable: boolean,
  ): Promise<PublishResult> {
    await this.persistPublishState(
      post,
      {
        error: createChannelTargetError(code, message, isRetryable),
        executionState: TargetExecutionState.FAILED,
      },
      message,
    );
    this.emitPublishFailedWebhook(post, message, platform || undefined);
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
    await this.failChildren(post, 'Parent post failed');
    await this.activitiesService.create(
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

  private readActionRequest(value: unknown): ScheduledPostWorkflowInput {
    const request = this.readRecord(value);
    const source = String(request.source ?? '');
    if (
      ![
        'manual_retry',
        'publish_now',
        'scheduled_sweep',
        'tiktok_app',
      ].includes(source)
    ) {
      throw new Error(
        `Scheduled post delivery received invalid source ${source}`,
      );
    }
    const organizationId = String(request.organizationId ?? '');
    const postId = String(request.postId ?? '');
    if (!organizationId || !postId) {
      throw new Error(
        'Scheduled post delivery requires organizationId and postId',
      );
    }
    return {
      organizationId,
      postId,
      source: source as ScheduledPostWorkflowInput['source'],
    };
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readPublishResult(value: unknown): PublishResult {
    const result = this.readRecord(value);
    const executionState = Object.values(TargetExecutionState).includes(
      result.executionState as TargetExecutionState,
    )
      ? (result.executionState as TargetExecutionState)
      : TargetExecutionState.FAILED;

    return {
      ...(typeof result.error === 'string' ? { error: result.error } : {}),
      executionState,
      externalId:
        typeof result.externalId === 'string' ? result.externalId : null,
      ...(result.isProviderDraft === true ? { isProviderDraft: true } : {}),
      platform: typeof result.platform === 'string' ? result.platform : '',
      success: result.success === true,
      url: typeof result.url === 'string' ? result.url : '',
    };
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
        await this.postsService.patch(child.id.toString(), {});
      } catch (error: unknown) {
        this.logger.error(`${url} failed to mark child as failed`, {
          childPostId: child.id.toString(),
          error: getErrorMessage(error, {
            fallback: () => undefined,
            messageSource: 'error-instance',
          }),
          parentPostId: post.id.toString(),
        });
      }
    }
  }
}
