import { randomUUID } from 'node:crypto';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { unavailableLearningReceiptV1 } from '@api/collections/content-learning/services/learning-generation-application.util';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { invalidThreadCountMessage } from '@api/collections/posts/controllers/operations/posts-generation.helpers';
import { GenerateAccountPostDto } from '@api/collections/posts/dto/generate-account-post.dto';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  type AccountGenerationIdentity,
  type AccountGenerationRun,
} from '@api/collections/posts/services/post-account-generation.types';
import { PostAccountGenerationBillingService } from '@api/collections/posts/services/post-account-generation-billing.service';
import {
  type AccountGenerationPageOptions,
  queuedAccountGenerationRun,
} from '@api/collections/posts/services/post-account-generation-job.types';
import {
  acceptsAccountText,
  buildAccountPostPrompt,
  buildAccountThreadPrompt,
  splitThreadText,
  withRunContext,
} from '@api/collections/posts/services/post-account-generation-prompt.util';
import {
  ACCOUNT_GENERATION_PAGE_SIZE,
  PostAccountGenerationQueueService,
} from '@api/collections/posts/services/post-account-generation-queue.service';
import {
  accountGenerationErrorCode,
  accountGenerationFailure,
} from '@api/collections/posts/services/post-account-generation-reason.util';
import { PostAccountLearningService } from '@api/collections/posts/services/post-account-learning.service';
import { extractPostGenerationLabel } from '@api/collections/posts/services/post-generation-text.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { WebSocketPaths } from '@api/helpers/utils/websocket/websocket.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { BrandedModeResolverService } from '@api/services/branded-text-generation/branded-mode-resolver.service';
import { BrandedTextGenerationService } from '@api/services/branded-text-generation/branded-text-generation.service';
import type {
  BrandedTextGenerationOutcomeV1,
  BrandedTextGenerationRequestV1,
} from '@api/services/branded-text-generation/branded-text-generation.types';
import { isOpenRouterTextModel } from '@api/services/integrations/openrouter/openrouter-model.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  PostCategory,
  PostFormat,
  Status,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { ACCOUNT_GENERATION_POST_SOURCE } from '@genfeedai/contracts/constants';
import type { AccountPublishingContext } from '@genfeedai/contracts/interfaces';
import type { LearningGenerationReceipt } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';

const POPULATE = [
  { path: 'ingredients', select: ['id', 'cdnUrl'] },
  { path: 'credential', select: ['id', 'label', 'externalHandle'] },
];

/** One dispatch: a standalone post, or the whole thread a single receipt binds. */
interface DispatchUnit {
  basePrompt: string;
  candidateIndex: number;
  format: 'text' | 'thread';
  learning: LearningGenerationReceipt;
  /** Texts the run already wrote, so this dispatch does not repeat them. */
  previousTexts: string[];
  posts: PostDocument[];
  requestKey: string;
}

type DispatchResult =
  | { kind: 'completed'; posts: PostDocument[] }
  | { kind: 'failed' }
  | { kind: 'in_progress' };

/**
 * Account and thread generation through the branded seam (#5786). A run makes
 * one branded dispatch and one receipt per post (a thread is one dispatch: its
 * receipt binds the whole thread), all tied by the run's batch id. The run
 * holds credits once up front; placeholders are patched as each dispatch
 * finishes. A failed dispatch stops only its own placeholder, which then waits
 * for an explicit retry under a new request key: nothing is retried or charged
 * automatically.
 */
@Injectable()
export class PostAccountGenerationService {
  private readonly logContext = 'PostAccountGenerationService';

  constructor(
    private readonly accountPublishingContextService: AccountPublishingContextService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly agentChatModelRegistry: AgentChatModelRegistryService,
    private readonly billing: PostAccountGenerationBillingService,
    private readonly brandedModeResolver: BrandedModeResolverService,
    private readonly brandedTextGeneration: BrandedTextGenerationService,
    private readonly learning: PostAccountLearningService,
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly queue: PostAccountGenerationQueueService,
  ) {}

  /**
   * Admits the run (model, brand mode, one credit hold for every dispatch),
   * creates the placeholder posts and starts generating in the background.
   * Refuses with 402 before any placeholder exists when the balance cannot
   * cover the run.
   */
  async start(
    dto: GenerateAccountPostDto,
    identity: AccountGenerationIdentity,
  ): Promise<PostDocument[]> {
    if (
      !Number.isSafeInteger(dto.count) ||
      dto.count < 1 ||
      (dto.format === 'thread' && invalidThreadCountMessage(dto.count))
    )
      throw new BadRequestException('Invalid account generation count');
    const runId = randomUUID();
    await this.queue.claim(identity.organizationId, runId);
    let run: AccountGenerationRun | undefined;
    let createdPosts: PostDocument[] = [];
    try {
      const context = await this.accountPublishingContextService.resolve({
        brandId: identity.brandId,
        credentialId: dto.credentialId,
        organizationId: identity.organizationId,
        sourceLineage: {
          sourceReferenceIds: dto.sourceReferenceIds,
          sourceUrl: dto.sourceUrl,
          trendId: dto.trendId,
        },
        surface: dto.format === 'thread' ? 'thread' : 'post',
      });
      run = await this.admit({
        context,
        dispatchCount: dto.format === 'thread' ? 1 : dto.count,
        identity,
        poolKey: runId,
        runId,
      });
      createdPosts = await this.createPlaceholders(dto, run);
      await this.queue.enqueue({
        dto,
        offset: 0,
        postIds: createdPosts.map((post) => String(post.id)),
        previousTexts: [],
        run: queuedAccountGenerationRun(run),
      });
      return createdPosts;
    } catch (error) {
      const cleanup = await Promise.allSettled([
        ...createdPosts.map((post) =>
          this.failPost(
            post,
            accountGenerationFailure('account_generation_queue_unavailable'),
            null,
          ),
        ),
        this.queue.release(identity.organizationId, runId),
        ...(run ? [this.billing.releaseRun(run.funding, run.scope)] : []),
      ]);
      for (const result of cleanup)
        if (result.status === 'rejected')
          this.logger.error(
            'Account generation admission cleanup failed',
            result.reason,
            { runId },
          );
      throw error;
    }
  }

  /**
   * Retries one failed placeholder (a thread is retried whole) under a NEW
   * request key: one dispatch, one hold, one receipt. A repeat of the same
   * key answers from the saved receipt and is never charged again.
   */
  async retry(
    postId: string,
    requestKey: string,
    identity: AccountGenerationIdentity,
  ): Promise<PostDocument> {
    const scoped = {
      brandId: identity.brandId,
      isDeleted: false,
      organizationId: identity.organizationId,
    };
    const failed = await this.postsService.findOne(
      { ...scoped, id: postId },
      'none',
    );
    if (!failed) throw new NotFoundException('Post', postId);
    const root = failed.parentId
      ? await this.postsService.findOne(
          { ...scoped, id: String(failed.parentId) },
          'none',
        )
      : failed;
    if (
      !root ||
      root.source !== ACCOUNT_GENERATION_POST_SOURCE ||
      root.targetExecutionState !== TargetExecutionState.FAILED ||
      !root.promptUsed ||
      !root.credentialId
    )
      throw new ConflictException('account_generation_not_retryable');
    const isThread = root.format === PostFormat.THREAD;
    const children = isThread
      ? (
          await this.postsService.find({ ...scoped, parentId: root.id }, [])
        ).sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      : [];
    const context = await this.accountPublishingContextService.resolve({
      brandId: identity.brandId,
      credentialId: String(root.credentialId),
      organizationId: identity.organizationId,
      surface: isThread ? 'thread' : 'post',
    });
    const runId = root.groupId ? String(root.groupId) : randomUUID();
    const run = await this.admit({
      context,
      dispatchCount: 1,
      identity,
      parentRequestId: runId,
      poolKey: requestKey,
      runId,
    });
    const siblings = isThread
      ? []
      : (
          await this.postsService.findAll(
            {
              ...scoped,
              groupId: runId,
              id: { not: root.id },
              targetExecutionState: TargetExecutionState.DRAFT,
            },
            {
              page: 1,
              limit: ACCOUNT_GENERATION_PAGE_SIZE,
              sort: { order: -1 },
            },
            false,
          )
        ).docs;
    let claimed: PostDocument | null;
    try {
      claimed = await this.postsService.patchOneWhere(
        {
          ...scoped,
          id: root.id,
          targetExecutionState: TargetExecutionState.FAILED,
        },
        {
          targetError: Prisma.JsonNull,
          targetExecutionState: TargetExecutionState.PUBLISHING,
        },
        POPULATE,
      );
      if (!claimed) throw new ConflictException('account_generation_claimed');
      for (const child of children)
        await this.postsService.patch(String(child.id), {
          targetError: Prisma.JsonNull,
          targetExecutionState: TargetExecutionState.PUBLISHING,
        });
    } catch (error) {
      await this.billing.releaseRun(run.funding, run.scope);
      throw error;
    }
    const unit: DispatchUnit = {
      basePrompt: root.promptUsed,
      candidateIndex: 0,
      format: isThread ? 'thread' : 'text',
      learning: unavailableLearningReceiptV1('retry_not_resampled', new Date()),
      posts: [root, ...children],
      previousTexts: siblings.map((post) => post.description),
      requestKey,
    };
    this.executeRetry(run, unit).catch((error) => {
      this.logger.error('Failed to retry account generation', error);
    });
    return claimed;
  }

  /** The background run: one dispatch per post, in order; one failure never stops the rest. */
  async execute(
    dto: GenerateAccountPostDto,
    run: AccountGenerationRun,
    createdPosts: PostDocument[],
    page: AccountGenerationPageOptions = {
      isLastPage: true,
      previousTexts: [],
    },
  ): Promise<string[] | undefined> {
    // The activity is created inside the try so a failure here cannot leave the
    // already-created placeholders stuck in PROCESSING (issue #861).
    let activity: ActivityDocument | undefined;
    const finished = new Set<string>();
    const written: string[] = [...page.previousTexts];
    let hasFailed = false;
    try {
      activity = await this.activityRecorder.record({
        brandId: run.identity.brandId,
        key: ActivityKey.POST_PROCESSING,
        organizationId: run.identity.organizationId,
        source: ActivitySource.POST_GENERATION,
        userId: run.identity.userId,
        value: JSON.stringify({
          count: createdPosts.length,
          requestedCount: dto.count,
          topic: dto.topic?.substring(0, 100),
          type: `${dto.format}-generation`,
        }),
      });
      const session = await this.learning.resolve(
        dto,
        createdPosts,
        run.identity,
      );
      const units = this.plan(dto, run, createdPosts, session.receipts);
      let completedCount = 0;
      let firstCompletedPostId: string | undefined;
      for (const unit of units) {
        await this.queue.renew(run.scope.organizationId, run.runId);
        const result = await this.dispatch(run, {
          ...unit,
          previousTexts: [...written],
        });
        for (const post of unit.posts) finished.add(String(post.id));
        if (result.kind !== 'completed') continue;
        for (const [offset, post] of result.posts.entries()) {
          written.push(post.description);
          completedCount++;
          firstCompletedPostId ??= String(post.id);
          await this.recordCompleted(dto, run, post, {
            index: createdPosts.findIndex(
              (created) => String(created.id) === String(post.id),
            ),
            session,
            offset,
          });
        }
      }
      await this.finishActivity(
        activity,
        completedCount,
        createdPosts.length,
        firstCompletedPostId,
      );
    } catch (error) {
      hasFailed = true;
      this.logger.error('Failed to generate account content asynchronously', {
        error,
        platform: run.context.account.platform,
      });
      await this.failActivity(activity, error, run);
      for (const post of createdPosts)
        if (!finished.has(String(post.id)))
          await this.failPost(
            post,
            accountGenerationFailure(accountGenerationErrorCode(error)),
            null,
          );
    } finally {
      if (hasFailed || page.isLastPage)
        await this.billing.releaseRun(run.funding, run.scope);
    }
    return hasFailed ? undefined : written.slice(-ACCOUNT_GENERATION_PAGE_SIZE);
  }

  private async executeRetry(
    run: AccountGenerationRun,
    unit: DispatchUnit,
  ): Promise<void> {
    try {
      const result = await this.dispatch(run, unit);
      if (result.kind === 'completed')
        for (const post of result.posts)
          await this.activityRecorder.record({
            brandId: run.identity.brandId,
            entityId: String(post.id),
            entityModel: ActivityEntityModel.POST,
            key: ActivityKey.POST_GENERATED,
            organizationId: run.identity.organizationId,
            source: ActivitySource.POST_GENERATION,
            userId: run.identity.userId,
            value: String(post.id),
          });
      // A replay still in progress belongs to the original request: its hold stays.
      if (result.kind !== 'in_progress')
        await this.billing.releaseRun(run.funding, run.scope);
    } catch (error) {
      this.logger.error('Account generation retry failed', error);
      for (const post of unit.posts)
        await this.failPost(
          post,
          accountGenerationFailure(accountGenerationErrorCode(error)),
          null,
        );
      await this.billing.releaseRun(run.funding, run.scope);
    }
  }

  private async admit(params: {
    context: AccountPublishingContext;
    dispatchCount: number;
    identity: AccountGenerationIdentity;
    parentRequestId?: string;
    poolKey: string;
    runId: string;
  }): Promise<AccountGenerationRun> {
    const { context, identity } = params;
    const model = await this.agentChatModelRegistry.resolveModelKey(
      undefined,
      DEFAULT_MINI_TEXT_MODEL,
    );
    if (!isOpenRouterTextModel(model))
      throw new UnprocessableEntityException('provider_capability_unsupported');
    const brandMode = await this.brandedModeResolver.resolve(
      identity,
      identity.brandId,
    );
    const scope = {
      actorUserId: identity.userId,
      brandId: identity.brandId,
      organizationId: identity.organizationId,
    };
    const funding = await this.billing.reserveRun({
      dispatchCount: params.dispatchCount,
      model,
      runId: params.poolKey,
      scope,
    });
    return {
      brandMode,
      context,
      funding,
      identity,
      limit:
        context.constraints.maxWeightedCharacters ??
        context.constraints.maxCharacters ??
        5000,
      model,
      ...(params.parentRequestId
        ? { parentRequestId: params.parentRequestId }
        : {}),
      runId: params.runId,
      scope,
    };
  }

  private promptInput(
    dto: Pick<GenerateAccountPostDto, 'count' | 'tone' | 'topic'>,
    run: AccountGenerationRun,
  ) {
    return {
      context: run.context,
      count: dto.count,
      limit: run.limit,
      tone: dto.tone || TweetTone.PROFESSIONAL,
      topic: dto.topic,
    };
  }

  async createPlaceholders(
    dto: GenerateAccountPostDto,
    run: AccountGenerationRun,
    offset = 0,
  ): Promise<PostDocument[]> {
    const isThread = dto.format === 'thread';
    const input = this.promptInput(dto, run);
    const createdPosts: PostDocument[] = [];
    let rootPostId: string | undefined;
    const pageEnd = Math.min(dto.count, offset + ACCOUNT_GENERATION_PAGE_SIZE);
    try {
      for (let i = offset; i < pageEnd; i++) {
        const post = await this.postsService.create({
          brandId: run.identity.brandId,
          category: PostCategory.TEXT,
          credentialId: dto.credentialId,
          description: 'Generating...',
          format: isThread ? PostFormat.THREAD : PostFormat.STANDARD,
          groupId: run.runId,
          ingredients: [],
          label: '',
          order: i,
          organizationId: run.identity.organizationId,
          parentId: isThread && i > 0 ? rootPostId : undefined,
          platform: run.context.account.platform,
          promptUsed: isThread
            ? buildAccountThreadPrompt(input)
            : buildAccountPostPrompt({ ...input, index: i }),
          source: ACCOUNT_GENERATION_POST_SOURCE,
          targetExecutionState: TargetExecutionState.PUBLISHING,
          userId: run.identity.userId,
        });
        createdPosts.push(post);
        if (i === 0) rootPostId = String(post.id);
      }
    } catch (error) {
      await Promise.allSettled(
        createdPosts.map((post) =>
          this.failPost(
            post,
            accountGenerationFailure('account_generation_placeholder_failed'),
            null,
          ),
        ),
      );
      throw error;
    }
    return createdPosts;
  }

  /** A thread is one dispatch over all its posts; anything else is one dispatch per post. */
  private plan(
    dto: GenerateAccountPostDto,
    run: AccountGenerationRun,
    createdPosts: PostDocument[],
    receipts: LearningGenerationReceipt[],
  ): DispatchUnit[] {
    if (dto.format === 'thread')
      return [
        {
          basePrompt: buildAccountThreadPrompt(this.promptInput(dto, run)),
          candidateIndex: 0,
          format: 'thread',
          learning: receipts[0],
          posts: createdPosts,
          previousTexts: [],
          requestKey: run.runId,
        },
      ];
    return createdPosts.map((post, index) => ({
      basePrompt: buildAccountPostPrompt({
        ...this.promptInput(dto, run),
        index: post.order ?? index,
      }),
      candidateIndex: post.order ?? index,
      format: 'text' as const,
      learning: receipts[index],
      posts: [post],
      previousTexts: [],
      requestKey: run.runId,
    }));
  }

  /** One branded dispatch. Never throws: its outcome is written to its own placeholders. */
  private async dispatch(
    run: AccountGenerationRun,
    unit: DispatchUnit,
  ): Promise<DispatchResult> {
    const dispatchKey = `${unit.requestKey}:${unit.candidateIndex}`;
    const isThread = unit.format === 'thread';
    let holdId: string | null = null;
    let outcome: BrandedTextGenerationOutcomeV1;
    try {
      const request = this.buildRequest(run, unit, (id) => {
        holdId = id;
      });
      outcome = isThread
        ? await this.brandedTextGeneration.generateThread(request)
        : await this.brandedTextGeneration.generate(request);
    } catch (error) {
      // A thrown failure leaves a bound hold to expire: whether the provider
      // was reached is unknown, so it is neither charged nor returned here.
      this.logger.warn(`${this.logContext} dispatch threw`, {
        dispatchKey,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.failUnit(
        unit,
        accountGenerationFailure(accountGenerationErrorCode(error)),
        null,
      );
      return { kind: 'failed' };
    }
    await this.settleHold(run, holdId, dispatchKey, outcome);
    if (outcome.kind === 'in_progress') return { kind: 'in_progress' };
    if (outcome.kind === 'stopped') {
      await this.failUnit(
        unit,
        accountGenerationFailure(outcome.reasonCode),
        outcome.receipt,
      );
      return { kind: 'failed' };
    }
    const posts: PostDocument[] = [];
    for (const post of unit.posts)
      posts.push(await this.linkReceipt(post, outcome.receipt));
    for (const [index, post] of posts.entries())
      await this.emitCompleted(
        post,
        outcome.receipt,
        index === 0 ? unit.learning : undefined,
      );
    return { kind: 'completed', posts };
  }

  private buildRequest(
    run: AccountGenerationRun,
    unit: DispatchUnit,
    holdBound: (holdId: string | null) => void,
  ): BrandedTextGenerationRequestV1 {
    const isThread = unit.format === 'thread';
    const dispatchKey = `${unit.requestKey}:${unit.candidateIndex}`;
    const root = unit.posts[0];
    const options = {
      count: unit.posts.length,
      isThread,
      limit: run.limit,
      usesWeightedCharacters: Boolean(
        run.context.constraints.usesWeightedCharacters,
      ),
    };
    return {
      acceptText: (text) => acceptsAccountText(text, options),
      admitDispatch: async () => {
        holdBound(
          await this.billing.bindDispatch(run.funding, run.scope, dispatchKey),
        );
      },
      initiatingActor: run.identity,
      input: {
        schemaVersion: 1,
        actorId: run.identity.userId,
        organizationId: run.identity.organizationId,
        brandId: run.identity.brandId,
        requestKey: unit.requestKey,
        candidateIndex: unit.candidateIndex,
        surface: 'api',
        contentType: isThread ? 'thread' : 'post',
        format: unit.format,
        ...run.brandMode,
        runId: run.runId,
        ...(run.parentRequestId
          ? { parentRequestId: run.parentRequestId }
          : {}),
        originalPrompt: withRunContext(unit.basePrompt, unit.previousTexts),
        provider: 'openrouter',
        model: run.model,
        generationParameters: {
          maxTokens: Math.min(
            32000,
            isThread
              ? Math.max(
                  TEXT_GENERATION_LIMITS.postThreadGeneration,
                  Math.ceil(run.limit / 2) * unit.posts.length,
                )
              : Math.max(
                  TEXT_GENERATION_LIMITS.postTweetGeneration,
                  Math.ceil(run.limit / 2),
                ),
          ),
          temperature: 0.8,
        },
        platform: run.context.account.platform,
        objective: 'engagement',
        destinationCredentialId: String(root.credentialId),
        knowledgeSourceIds: [],
        knowledgeSpaceIds: [],
      },
      persistText: (text) => this.persistText(unit, text),
      privateLearning: unit.learning,
      resolveApiKey: async () => run.funding.apiKey,
    };
  }

  /** Saves the accepted text into the placeholders; the receipt then binds it. */
  private async persistText(
    unit: DispatchUnit,
    text: string,
  ): Promise<{ postId: string }> {
    const parts = unit.format === 'thread' ? splitThreadText(text) : [text];
    for (const [index, post] of unit.posts.entries())
      await this.postsService.patch(
        String(post.id),
        {
          description: parts[index],
          label: extractPostGenerationLabel(parts[index]),
          targetExecutionState: TargetExecutionState.DRAFT,
        },
        POPULATE,
      );
    return { postId: String(unit.posts[0].id) };
  }

  private async linkReceipt(
    post: PostDocument,
    receipt: BrandedGenerationReceiptV1,
  ): Promise<PostDocument> {
    return this.postsService.patch(
      String(post.id),
      { brandedReceiptId: receipt.id, brandedReceiptState: receipt.state },
      POPULATE,
    );
  }

  /** A hold is charged when the provider recorded an attempt, returned when none was reached. */
  private async settleHold(
    run: AccountGenerationRun,
    holdId: string | null,
    dispatchKey: string,
    outcome: BrandedTextGenerationOutcomeV1,
  ): Promise<void> {
    if (!holdId || outcome.kind === 'in_progress') return;
    try {
      if (outcome.receipt.execution?.providerAttemptRef)
        await this.billing.settleDispatch(
          run.funding,
          run.scope,
          holdId,
          dispatchKey,
        );
      else await this.billing.releaseDispatch(run.scope, holdId);
    } catch (error) {
      this.logger.error(`${this.logContext} dispatch settlement failed`, {
        dispatchKey,
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  private async failUnit(
    unit: DispatchUnit,
    failure: { code: string; message: string },
    receipt: BrandedGenerationReceiptV1 | null,
  ): Promise<void> {
    for (const post of unit.posts) await this.failPost(post, failure, receipt);
  }

  private async failPost(
    post: PostDocument,
    failure: { code: string; message: string },
    receipt: BrandedGenerationReceiptV1 | null,
  ): Promise<void> {
    const postId = String(post.id);
    try {
      await this.postsService.patch(postId, {
        targetError: {
          code: failure.code,
          failedAt: new Date().toISOString(),
          isRetryable: true,
          message: failure.message,
        },
        targetExecutionState: TargetExecutionState.FAILED,
        ...(receipt
          ? {
              brandedReceiptId: receipt.id,
              brandedReceiptState: receipt.state,
            }
          : {}),
      });
      await this.websocketService.emit(WebSocketPaths.post(postId), {
        error: failure.message,
        reasonCode: failure.code,
        status: Status.FAILED,
        ...(receipt ? { brandedReceipt: this.summary(receipt) } : {}),
      });
    } catch (patchError) {
      this.logger.error(
        `Failed to update post ${postId} to FAILED status`,
        patchError,
      );
    }
  }

  private summary(receipt: BrandedGenerationReceiptV1) {
    return {
      compliance: receipt.compliance,
      id: receipt.id,
      revision: receipt.revision,
      state: receipt.state,
    };
  }

  private async emitCompleted(
    post: PostDocument,
    receipt: BrandedGenerationReceiptV1,
    learningReceipt: LearningGenerationReceipt | undefined,
  ): Promise<void> {
    await this.websocketService.emit(WebSocketPaths.post(String(post.id)), {
      brandedReceipt: this.summary(receipt),
      result: post,
      status: Status.COMPLETED,
      ...(learningReceipt ? { learningReceipt } : {}),
    });
  }

  /** Post-dispatch bookkeeping that must never turn a saved draft into a failure. */
  private async recordCompleted(
    dto: GenerateAccountPostDto,
    run: AccountGenerationRun,
    post: PostDocument,
    learning: {
      index: number;
      offset: number;
      session: Awaited<ReturnType<PostAccountLearningService['resolve']>>;
    },
  ): Promise<void> {
    const postId = String(post.id);
    try {
      await this.learning.bindArtifact(
        learning.session,
        learning.index,
        postId,
        post.description,
      );
      await this.activityRecorder.record({
        brandId: run.identity.brandId,
        entityId: postId,
        entityModel: ActivityEntityModel.POST,
        key: ActivityKey.POST_GENERATED,
        organizationId: run.identity.organizationId,
        source: ActivitySource.POST_GENERATION,
        userId: run.identity.userId,
        value: postId,
      });
    } catch (error) {
      this.logger.warn(`${this.logContext} completion bookkeeping failed`, {
        error: error instanceof Error ? error.message : String(error),
        postId,
      });
    }
    try {
      await this.recordLineage(dto, run, postId);
    } catch (lineageError) {
      this.logger.warn('Failed to record post remix lineage', {
        error:
          lineageError instanceof Error
            ? lineageError.message
            : String(lineageError),
        postId,
      });
    }
  }

  private async recordLineage(
    dto: GenerateAccountPostDto,
    run: AccountGenerationRun,
    postId: string,
  ): Promise<void> {
    const metadata: Record<string, unknown> = {};
    if (dto.sourceReferenceIds?.length)
      metadata.sourceReferenceIds = dto.sourceReferenceIds.map(String);
    if (dto.sourceUrl) metadata.sourceUrl = dto.sourceUrl;
    if (dto.trendId) {
      metadata.trendId = String(dto.trendId);
      metadata.trendIds = [String(dto.trendId)];
    }
    if (Object.keys(metadata).length === 0) return;
    await this.trendReferenceCorpusService.recordPostRemixLineage({
      brandId: run.identity.brandId,
      draftType: dto.format === 'thread' ? 'thread' : 'tweet',
      generatedBy: 'posts-generation',
      metadata,
      organizationId: run.identity.organizationId,
      platforms: [run.context.account.platform],
      postId,
      prompt: dto.topic,
    });
  }

  private async finishActivity(
    activity: ActivityDocument,
    completedCount: number,
    totalCount: number,
    firstCompletedPostId: string | undefined,
  ): Promise<void> {
    try {
      await this.activityRecorder.update(activity, {
        isRead: false,
        key:
          completedCount === totalCount
            ? ActivityKey.POST_GENERATED
            : ActivityKey.POST_FAILED,
        value: JSON.stringify({
          completedCount,
          resultId: firstCompletedPostId,
          totalCount,
          ...(completedCount < totalCount
            ? { error: 'Some posts could not be generated' }
            : {}),
        }),
      });
    } catch (activityError) {
      this.logger.error(
        'Failed to finalize post generation activity',
        activityError,
      );
    }
  }

  private async failActivity(
    activity: ActivityDocument | undefined,
    error: unknown,
    run: AccountGenerationRun,
  ): Promise<void> {
    if (!activity) return;
    try {
      await this.activityRecorder.update(activity, {
        key: ActivityKey.POST_FAILED,
        value: JSON.stringify({
          error: (error as Error)?.message || 'Generation failed',
        }),
      });
    } catch (activityError) {
      // Never let an activity-update failure short-circuit the cleanup that
      // marks the placeholders FAILED.
      this.logger.error(
        'Failed to mark activity as failed during account content cleanup',
        { activityError, platform: run.context.account.platform },
      );
    }
  }
}
