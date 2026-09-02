import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import {
  normalizeReplyBotPlatform,
  unsupportedReplyBotPlatformMessage,
} from '@api/services/reply-bot/reply-bot-platform.util';
import {
  buildReplyBotContentWorkflowDefinition,
  buildReplyBotDmWorkflowDefinition,
  buildReplyBotOrganizationWorkflowDefinition,
  buildReplyBotTestWorkflowDefinition,
  buildReplyBotWorkflowDefinition,
  REPLY_BOT_ACTION_IDS,
} from '@api/services/reply-bot/reply-bot-workflow-definition';
import {
  type ReplyCandidate,
  ReplyCandidatePrefilterService,
} from '@api/services/reply-bot/reply-candidate-prefilter.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  getReplyIntentPersona,
  resolveReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import {
  type SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import { requireRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import {
  BotActivitySkipReason,
  BotActivityStatus,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
  ReplyLength,
  ReplyTone,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type { IReplyBotCredentialData } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export interface ProcessingResult {
  botConfigId: string;
  platform: ReplyBotPlatform;
  contentProcessed: number;
  repliesSent: number;
  dmsSent: number;
  skipped: number;
  errors: number;
}

type SerializedReplyCandidate = Omit<ReplyCandidate, 'createdAt'> & {
  createdAt: string;
};
type ReplyBotRequest = {
  botConfigId: string;
  credentialId: string;
  organizationId: string;
};
type ReplyBotContentRequest = ReplyBotRequest & {
  content: SerializedReplyCandidate;
};
type ReplyBotContentResult = {
  dmSent: boolean;
  error?: boolean;
  replySent: boolean;
  skipped: boolean;
};
type ReplyBotContentState = ReplyBotContentRequest & {
  activityId?: string;
  dmDelayMs: number;
  dmItems: ReplyBotDmRequest[];
  dmText?: string;
  error?: string;
  intent?: ReturnType<typeof resolveReplyIntent> | 'default';
  replyContentId?: string;
  replyContentUrl?: string;
  replySent: boolean;
  replyText?: string;
  skipReason?: BotActivitySkipReason;
  skipped: boolean;
  test?: boolean;
};
type ReplyBotDmRequest = ReplyBotRequest & {
  activityId: string;
  dmText: string;
  recipientId: string;
  replyContentId?: string;
  replyContentUrl?: string;
  replyText?: string;
};
type ReplyBotDmState = ReplyBotDmRequest & {
  dmContentId?: string;
  error?: string;
  success: boolean;
};
type ForEachResult<T> = {
  count: number;
  results: Array<{ index: number; result: T }>;
};

@Injectable()
export class ReplyBotOrchestratorService implements OnModuleInit {
  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly socialMonitorService: SocialMonitorService,
    private readonly replyGenerationService: ReplyGenerationService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly rateLimitService: RateLimitService,
    private readonly replyCandidatePrefilterService: ReplyCandidatePrefilterService,
    private readonly replyBotConfigsService: ReplyBotConfigsService,
    private readonly monitoredAccountsService: MonitoredAccountsService,
    private readonly botActivitiesService: BotActivitiesService,
    private readonly processedTweetsService: ProcessedTweetsService,
    private readonly credentialsService: CredentialsService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    private readonly workflowQueue: WorkflowExecutionQueueService,
    private readonly authorReplyLoopService: AuthorReplyLoopService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerWorkflow(
      buildReplyBotOrganizationWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildReplyBotWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildReplyBotContentWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildReplyBotDmWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildReplyBotTestWorkflowDefinition(),
    );
    const actions = [
      [REPLY_BOT_ACTION_IDS.DISCOVER_BOTS, this.discoverBotsAction.bind(this)],
      [
        REPLY_BOT_ACTION_IDS.FINALIZE_ORGANIZATION,
        this.finalizeOrganizationAction.bind(this),
      ],
      [
        REPLY_BOT_ACTION_IDS.FETCH_CANDIDATES,
        this.fetchCandidatesAction.bind(this),
      ],
      [REPLY_BOT_ACTION_IDS.FINALIZE_BOT, this.finalizeBotAction.bind(this)],
      [REPLY_BOT_ACTION_IDS.CLAIM_CONTENT, this.claimContentAction.bind(this)],
      [
        REPLY_BOT_ACTION_IDS.GENERATE_REPLY,
        this.generateReplyAction.bind(this),
      ],
      [REPLY_BOT_ACTION_IDS.GENERATE_DM, this.generateDmAction.bind(this)],
      [REPLY_BOT_ACTION_IDS.SEND_REPLY, this.sendReplyAction.bind(this)],
      [
        REPLY_BOT_ACTION_IDS.FINALIZE_CONTENT,
        this.finalizeContentAction.bind(this),
      ],
      [REPLY_BOT_ACTION_IDS.SEND_DM, this.sendDmAction.bind(this)],
      [REPLY_BOT_ACTION_IDS.FINALIZE_DM, this.finalizeDmAction.bind(this)],
      [REPLY_BOT_ACTION_IDS.LOAD_TEST, this.loadTestAction.bind(this)],
      [REPLY_BOT_ACTION_IDS.FINALIZE_TEST, this.finalizeTestAction.bind(this)],
    ] as const;
    for (const [actionId, executor] of actions) {
      this.systemWorkflowRunner.registerAction(actionId, executor);
    }
  }

  async processOrganizationBots(
    organizationId: string,
    credentialId: string,
  ): Promise<ProcessingResult[]> {
    const definition = buildReplyBotOrganizationWorkflowDefinition();
    const { result } = await this.systemWorkflowRunner.runWorkflow<
      ProcessingResult[]
    >({
      actionType: definition.canonicalId,
      canonicalId: definition.canonicalId,
      inputValues: { request: { credentialId, organizationId } },
      organizationId,
      source: 'ReplyBotOrchestratorService.processOrganizationBots',
      trigger: WorkflowExecutionTrigger.SCHEDULED,
    });
    return result;
  }

  async queueOrganizationBots(
    organizationId: string,
    credentialId: string,
  ): Promise<string> {
    const definition = buildReplyBotOrganizationWorkflowDefinition();
    return this.workflowQueue.queueSystemWorkflow(
      {
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: { request: { credentialId, organizationId } },
        organizationId,
        source: 'reply-bot-manual-poll',
        trigger: WorkflowExecutionTrigger.API,
      },
      `reply-bot-poll-${organizationId}-${credentialId}-${Date.now()}`,
    );
  }

  async processSingleBot(
    botConfigId: string,
    organizationId: string,
    credentialId: string,
  ): Promise<ProcessingResult> {
    const definition = buildReplyBotWorkflowDefinition();
    const { result } =
      await this.systemWorkflowRunner.runWorkflow<ProcessingResult>({
        actionType: definition.canonicalId,
        canonicalId: definition.canonicalId,
        inputValues: {
          request: { botConfigId, credentialId, organizationId },
        },
        organizationId,
        source: 'ReplyBotOrchestratorService.processSingleBot',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
      });
    return result;
  }

  async testReplyGeneration(
    botConfigId: string,
    organizationId: string,
    testContent: { content: string; author: string },
  ): Promise<{ replyText: string; dmText?: string }> {
    const definition = buildReplyBotTestWorkflowDefinition();
    const { result } = await this.systemWorkflowRunner.runWorkflow<{
      dmText?: string;
      replyText: string;
    }>({
      actionType: definition.canonicalId,
      canonicalId: definition.canonicalId,
      inputValues: { request: { botConfigId, organizationId, testContent } },
      organizationId,
      source: 'ReplyBotOrchestratorService.testReplyGeneration',
      trigger: WorkflowExecutionTrigger.API,
    });
    return result;
  }

  private async discoverBotsAction(
    action: SystemWorkflowActionRequest,
  ): Promise<{ items: ReplyBotRequest[] }> {
    const request = this.readRecord(action.input.request);
    const organizationId = this.requiredString(
      request.organizationId,
      'organizationId',
    );
    const credentialId = this.requiredString(
      request.credentialId,
      'credentialId',
    );
    await this.loadCredential(credentialId, organizationId);
    const bots = await this.replyBotConfigsService.findActive(organizationId);
    return {
      items: bots.map((bot) => ({
        botConfigId: bot.id.toString(),
        credentialId,
        organizationId,
      })),
    };
  }

  private async finalizeOrganizationAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ProcessingResult[]> {
    return this.readForEachResult<ProcessingResult>(
      action.input.batch,
    ).results.map((entry) => entry.result);
  }

  private async fetchCandidatesAction(
    action: SystemWorkflowActionRequest,
  ): Promise<{
    botConfigId: string;
    fetchError?: string;
    items: ReplyBotContentRequest[];
    platform: ReplyBotPlatform;
    skipped: number;
  }> {
    const request = this.readBotRequest(action.input.request);
    const botConfig = await this.loadBotConfig(request);
    const credential = await this.loadCredential(
      request.credentialId,
      request.organizationId,
    );
    const platformInput =
      credential.platform ?? botConfig.platform ?? ReplyBotPlatform.TWITTER;
    const platform = normalizeReplyBotPlatform(platformInput);
    if (!platform)
      throw new Error(unsupportedReplyBotPlatformMessage(platformInput));
    if (!this.rateLimitService.isWithinSchedule(botConfig)) {
      return {
        botConfigId: request.botConfigId,
        items: [],
        platform,
        skipped: 0,
      };
    }
    try {
      const normalizedCredential = { ...credential, platform };
      const content = await this.fetchContent(
        botConfig,
        normalizedCredential,
        request.organizationId,
        platform,
      );
      const prefilter = this.replyCandidatePrefilterService.prefilter(content, {
        botConfig,
        botType: (botConfig.type ?? ReplyBotType.REPLY_GUY) as ReplyBotType,
        credential: normalizedCredential,
        organizationId: request.organizationId,
        platform,
      });
      if (prefilter.candidates.length > 0) {
        this.requireBotOwnerUserId(botConfig, request.botConfigId);
      }
      return {
        botConfigId: request.botConfigId,
        items: prefilter.candidates.map((contentItem) => ({
          ...request,
          content: this.serializeCandidate(contentItem),
        })),
        platform,
        skipped: prefilter.skipped,
      };
    } catch (error: unknown) {
      return {
        botConfigId: request.botConfigId,
        fetchError: this.errorMessage(error),
        items: [],
        platform,
        skipped: 0,
      };
    }
  }

  private async finalizeBotAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ProcessingResult> {
    const state = this.readRecord(action.input.state);
    const results = this.readForEachResult<ReplyBotContentResult>(
      action.input.batch,
    ).results.map((entry) => entry.result);
    return {
      botConfigId: this.requiredString(state.botConfigId, 'botConfigId'),
      contentProcessed: results.length,
      dmsSent: results.filter((result) => result.dmSent).length,
      errors:
        results.filter((result) => result.error).length +
        (state.fetchError ? 1 : 0),
      platform: state.platform as ReplyBotPlatform,
      repliesSent: results.filter((result) => result.replySent).length,
      skipped:
        this.numberValue(state.skipped) +
        results.filter((result) => result.skipped).length,
    };
  }

  private async claimContentAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotContentState> {
    const request = this.readContentRequest(action.input.request);
    const botConfig = await this.loadBotConfig(request);
    const ownerUserId = this.requireBotOwnerUserId(
      botConfig,
      request.botConfigId,
    );
    const rateCheck = await this.rateLimitService.checkRateLimit(
      request.botConfigId,
      request.organizationId,
    );
    if (!rateCheck.allowed) {
      await this.botActivitiesService.create({
        replyBotConfigId: botConfig.id,
        botType: botConfig.type,
        organizationId: request.organizationId,
        skipReason: BotActivitySkipReason.RATE_LIMITED,
        status: BotActivityStatus.SKIPPED,
        triggerTweetAuthorId: request.content.authorId,
        triggerTweetAuthorUsername: request.content.authorUsername,
        triggerTweetId: request.content.id,
        triggerTweetText: request.content.text,
        userId: ownerUserId,
      });
      return {
        ...request,
        dmDelayMs: 0,
        dmItems: [],
        replySent: false,
        skipReason: BotActivitySkipReason.RATE_LIMITED,
        skipped: true,
      };
    }
    const activity = await this.botActivitiesService.create({
      replyBotConfigId: botConfig.id,
      botType: botConfig.type,
      organizationId: request.organizationId,
      status: BotActivityStatus.PROCESSING,
      triggerTweetAuthorId: request.content.authorId,
      triggerTweetAuthorUsername: request.content.authorUsername,
      triggerTweetId: request.content.id,
      triggerTweetText: request.content.text,
      userId: ownerUserId,
    });
    const intent =
      botConfig.type === ReplyBotType.COMMENT_RESPONDER
        ? resolveReplyIntent(request.content.text)
        : 'default';
    const activityId = activity.id.toString();
    const state: ReplyBotContentState = {
      ...request,
      activityId,
      dmDelayMs: Math.max(0, botConfig.dmConfig?.delaySeconds ?? 60) * 1000,
      dmItems: [],
      intent,
      replySent: false,
      skipped: false,
    };
    if (
      botConfig.type === ReplyBotType.COMMENT_RESPONDER &&
      getReplyIntentPersona(intent).shouldSkipAuto
    ) {
      await this.botActivitiesService.updateStatus(
        activityId,
        request.organizationId,
        {
          completedAt: new Date(),
          errorMessage: 'Skipped spam/low-signal comment (intent filter)',
          status: BotActivityStatus.SKIPPED,
        },
      );
      await this.processedTweetsService.markAsProcessed(
        request.content.id,
        request.organizationId,
        ReplyBotType.COMMENT_RESPONDER,
        request.botConfigId,
      );
      return {
        ...state,
        skipReason: BotActivitySkipReason.FILTERED_OUT,
        skipped: true,
      };
    }
    return state;
  }

  private async generateReplyAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotContentState> {
    const state = this.readContentState(action.input);
    if (state.skipped || state.error) return state;
    try {
      const botConfig = await this.loadBotConfig(state);
      const ownerUserId = this.requireBotOwnerUserId(
        botConfig,
        state.botConfigId,
      );
      const ownPost = botConfig.type === ReplyBotType.COMMENT_RESPONDER;
      const intent = state.intent ?? 'default';
      const persona = getReplyIntentPersona(intent);
      const replyText = await this.replyGenerationService.generateReply({
        brandId:
          typeof botConfig.brandId === 'string' ? botConfig.brandId : undefined,
        context: this.mergeReplyContext(
          botConfig.context,
          state.content.replyContext,
        ),
        customInstructions: [
          botConfig.replyInstructions,
          ...(ownPost
            ? [persona.instructions, `Tone: ${persona.toneHint}.`]
            : []),
        ]
          .filter(Boolean)
          .join(' '),
        length:
          ownPost && (intent === 'thanks' || intent === 'troll')
            ? ReplyLength.SHORT
            : (botConfig.replyLength as ReplyLength) || ReplyLength.MEDIUM,
        organizationId: state.organizationId,
        platform: String(botConfig.platform ?? 'twitter'),
        tone: ownPost
          ? intent === 'troll'
            ? ReplyTone.HUMOROUS
            : intent === 'thanks'
              ? ReplyTone.FRIENDLY
              : intent === 'question'
                ? ReplyTone.INFORMATIVE
                : ReplyTone.ENGAGING
          : (botConfig.replyTone as ReplyTone) || ReplyTone.FRIENDLY,
        tweetAuthor: state.content.authorUsername,
        tweetContent: state.content.text,
        userId: ownerUserId,
      });
      return { ...state, replyText };
    } catch (error: unknown) {
      return { ...state, error: this.errorMessage(error) };
    }
  }

  private async generateDmAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotContentState> {
    const state = this.readContentState(action.input);
    if (state.skipped || state.error) return state;
    try {
      const botConfig = await this.loadBotConfig(state);
      if (
        botConfig.actionType !== ReplyBotActionType.REPLY_AND_DM &&
        botConfig.actionType !== ReplyBotActionType.DM_ONLY
      ) {
        return state;
      }
      const instructions = [
        botConfig.dmConfig?.customInstructions,
        botConfig.dmConfig?.offer
          ? `The offer: ${botConfig.dmConfig.offer}`
          : '',
        botConfig.dmConfig?.ctaLink
          ? `Include this link: ${botConfig.dmConfig.ctaLink}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      const dmText = await this.replyGenerationService.generateDm({
        context: botConfig.dmConfig?.context,
        customInstructions: instructions || undefined,
        organizationId: state.organizationId,
        replyText: this.requiredString(state.replyText, 'replyText'),
        tweetAuthor: state.content.authorUsername,
        tweetContent: state.content.text,
        userId: this.requireBotOwnerUserId(botConfig, state.botConfigId),
      });
      return { ...state, dmText };
    } catch (error: unknown) {
      return { ...state, error: this.errorMessage(error) };
    }
  }

  private async sendReplyAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotContentState> {
    const state = this.readContentState(action.input);
    if (state.skipped || state.error || state.test) return state;
    const botConfig = await this.loadBotConfig(state);
    let next = state;
    if (botConfig.actionType !== ReplyBotActionType.DM_ONLY) {
      try {
        const credential = await this.loadCredential(
          state.credentialId,
          state.organizationId,
        );
        const result = await this.botActionExecutorService.postReply(
          credential,
          this.deserializeCandidate(state.content),
          this.requiredString(state.replyText, 'replyText'),
        );
        if (!result.success) {
          return { ...state, error: result.error ?? 'Failed to post reply' };
        }
        next = {
          ...state,
          ...(result.contentId ? { replyContentId: result.contentId } : {}),
          ...(result.contentUrl ? { replyContentUrl: result.contentUrl } : {}),
          replySent: true,
        };
      } catch (error: unknown) {
        return { ...state, error: this.errorMessage(error) };
      }
    }
    if (next.dmText && next.activityId) {
      next = {
        ...next,
        dmItems: [
          {
            activityId: next.activityId,
            botConfigId: next.botConfigId,
            credentialId: next.credentialId,
            dmText: next.dmText,
            organizationId: next.organizationId,
            recipientId: next.content.authorId,
            ...(next.replyContentId
              ? { replyContentId: next.replyContentId }
              : {}),
            ...(next.replyContentUrl
              ? { replyContentUrl: next.replyContentUrl }
              : {}),
            ...(next.replyText ? { replyText: next.replyText } : {}),
          },
        ],
      };
    }
    return next;
  }

  private async finalizeContentAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotContentResult> {
    const state = this.readContentState(action.input);
    if (state.skipped)
      return { dmSent: false, replySent: false, skipped: true };
    const activityId = this.requiredString(state.activityId, 'activityId');
    if (state.error) {
      await this.botActivitiesService.updateStatus(
        activityId,
        state.organizationId,
        {
          errorMessage: state.error,
          status: BotActivityStatus.FAILED,
        },
      );
      return {
        dmSent: false,
        error: true,
        replySent: state.replySent,
        skipped: false,
      };
    }
    const dmScheduled =
      this.readForEachResult<{ jobId: string }>(action.input.dmDispatch).count >
      0;
    await this.botActivitiesService.updateStatus(
      activityId,
      state.organizationId,
      {
        ...(!dmScheduled ? { completedAt: new Date() } : {}),
        dmSent: false,
        dmText: state.dmText,
        replyText: state.replyText,
        replyTweetId: state.replyContentId,
        replyTweetUrl: state.replyContentUrl,
        status: dmScheduled
          ? BotActivityStatus.PROCESSING
          : BotActivityStatus.COMPLETED,
      },
    );
    const botConfig = await this.loadBotConfig(state);
    await this.processedTweetsService.markAsProcessed(
      state.content.id,
      state.organizationId,
      (botConfig.type ?? ReplyBotType.REPLY_GUY) as ReplyBotType,
      state.botConfigId,
    );
    if (
      state.replySent &&
      botConfig.type === ReplyBotType.COMMENT_RESPONDER &&
      (state.content.parentContentId || state.content.inReplyToId)
    ) {
      await this.authorReplyLoopService.recordAuthorClosedLoop({
        brandId:
          typeof botConfig.brandId === 'string' ? botConfig.brandId : undefined,
        commentId: state.content.id,
        organizationId: state.organizationId,
        parentPostId:
          state.content.parentContentId ?? state.content.inReplyToId ?? '',
        platform: String(botConfig.platform ?? 'twitter'),
        replyContentId: state.replyContentId,
      });
    }
    this.rateLimitService.incrementCounter(state.botConfigId);
    return { dmSent: false, replySent: state.replySent, skipped: false };
  }

  private async sendDmAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotDmState> {
    const request = this.readDmRequest(action.input.request);
    try {
      const credential = await this.loadCredential(
        request.credentialId,
        request.organizationId,
      );
      const result = await this.botActionExecutorService.sendDm(
        credential,
        request.recipientId,
        request.dmText,
      );
      return {
        ...request,
        ...(result.contentId ? { dmContentId: result.contentId } : {}),
        ...(result.success
          ? {}
          : { error: result.error ?? 'Failed to send DM' }),
        success: result.success,
      };
    } catch (error: unknown) {
      return { ...request, error: this.errorMessage(error), success: false };
    }
  }

  private async finalizeDmAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotDmState> {
    const state = this.readDmState(action.input);
    await this.botActivitiesService.updateStatus(
      state.activityId,
      state.organizationId,
      state.success
        ? {
            completedAt: new Date(),
            dmSent: true,
            dmText: state.dmText,
            replyText: state.replyText,
            replyTweetId: state.replyContentId,
            replyTweetUrl: state.replyContentUrl,
            status: BotActivityStatus.COMPLETED,
          }
        : {
            errorMessage: state.error ?? 'Failed to send DM',
            status: BotActivityStatus.FAILED,
          },
    );
    return state;
  }

  private async loadTestAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ReplyBotContentState> {
    const request = this.readRecord(action.input.request);
    const botConfigId = this.requiredString(request.botConfigId, 'botConfigId');
    const organizationId = this.requiredString(
      request.organizationId,
      'organizationId',
    );
    const testContent = this.readRecord(request.testContent);
    const botConfig = await this.loadBotConfig({ botConfigId, organizationId });
    const platform = normalizeReplyBotPlatform(
      botConfig.platform ?? ReplyBotPlatform.TWITTER,
    );
    if (!platform)
      throw new Error(unsupportedReplyBotPlatformMessage(botConfig.platform));
    return {
      botConfigId,
      content: {
        authorId: 'dry-run-author',
        authorUsername: this.requiredString(testContent.author, 'author'),
        contentType: 'post' as SerializedReplyCandidate['contentType'],
        createdAt: new Date().toISOString(),
        id: 'dry-run-content',
        platform,
        text: this.requiredString(testContent.content, 'content'),
      },
      credentialId: '',
      dmDelayMs: 0,
      dmItems: [],
      intent: 'default',
      organizationId,
      replySent: false,
      skipped: false,
      test: true,
    };
  }

  private async finalizeTestAction(
    action: SystemWorkflowActionRequest,
  ): Promise<{
    dmText?: string;
    replyText: string;
  }> {
    const state = this.readContentState(action.input);
    if (state.error) throw new Error(state.error);
    return {
      ...(state.dmText ? { dmText: state.dmText } : {}),
      replyText: this.requiredString(state.replyText, 'replyText'),
    };
  }

  private async fetchContent(
    botConfig: ReplyBotConfigDocument,
    credential: IReplyBotCredentialData,
    organizationId: string,
    platform: ReplyBotPlatform,
  ): Promise<SocialContentData[]> {
    if (botConfig.type === ReplyBotType.REPLY_GUY) {
      if (!credential.username) return [];
      const mentions = await this.socialMonitorService.getUserMentions(
        platform,
        credential.username,
        {
          limit: 100,
          sinceId: botConfig.lastProcessedTweetId,
        },
      );
      return this.socialMonitorService.filterUnprocessedContent(
        mentions,
        organizationId,
        ReplyBotType.REPLY_GUY,
      );
    }
    if (botConfig.type === ReplyBotType.ACCOUNT_MONITOR) {
      return this.fetchMonitoredAccountContent(
        botConfig,
        organizationId,
        platform,
      );
    }
    if (botConfig.type === ReplyBotType.COMMENT_RESPONDER) {
      return this.fetchComments(
        botConfig,
        credential,
        organizationId,
        platform,
      );
    }
    return [];
  }

  private async fetchMonitoredAccountContent(
    botConfig: ReplyBotConfigDocument,
    organizationId: string,
    platform: ReplyBotPlatform,
  ): Promise<SocialContentData[]> {
    const accounts = await this.monitoredAccountsService.findByBotConfig(
      botConfig.id.toString(),
      organizationId,
    );
    const allContent: SocialContentData[] = [];
    for (const account of accounts) {
      if (!account.isActive || !account.username) continue;
      const content = await this.socialMonitorService.getUserTimeline(
        platform,
        account.username,
        {
          limit: 10,
          sinceId: account.lastProcessedTweetId,
        },
      );
      const filtered = this.socialMonitorService.filterContent(
        content,
        account.filters,
      );
      const unprocessed =
        await this.socialMonitorService.filterUnprocessedContent(
          filtered,
          organizationId,
          ReplyBotType.ACCOUNT_MONITOR,
        );
      if (unprocessed[0]) {
        await this.monitoredAccountsService.updateLastProcessed(
          account.id.toString(),
          organizationId,
          unprocessed[0].id,
        );
      }
      allContent.push(...unprocessed);
    }
    return allContent;
  }

  private async fetchComments(
    botConfig: ReplyBotConfigDocument,
    credential: IReplyBotCredentialData,
    organizationId: string,
    platform: ReplyBotPlatform,
  ): Promise<SocialContentData[]> {
    if (!credential.username) return [];
    const posts = await this.socialMonitorService.getUserTimeline(
      platform,
      credential.username,
      {
        limit: 10,
      },
    );
    const comments = (
      await Promise.all(
        posts.map(async (post) => {
          const rows = await this.socialMonitorService.getContentComments(
            platform,
            post.id,
            {
              brandId:
                typeof botConfig.brandId === 'string'
                  ? botConfig.brandId
                  : undefined,
              limit: 50,
              organizationId,
              preferOfficialApi: true,
            },
          );
          return rows.map((comment) => ({
            ...comment,
            parentContentId: comment.parentContentId ?? post.id,
          }));
        }),
      )
    ).flat();
    const unprocessed =
      await this.socialMonitorService.filterUnprocessedContent(
        comments,
        organizationId,
        ReplyBotType.COMMENT_RESPONDER,
      );
    return unprocessed.filter((item) => {
      const included =
        !botConfig.filters?.includeKeywords?.length ||
        botConfig.filters.includeKeywords.some((keyword) =>
          item.text.toLowerCase().includes(keyword.toLowerCase()),
        );
      const excluded = botConfig.filters?.excludeKeywords?.some((keyword) =>
        item.text.toLowerCase().includes(keyword.toLowerCase()),
      );
      return included && !excluded;
    });
  }

  private async loadCredential(
    credentialId: string,
    organizationId: string,
  ): Promise<IReplyBotCredentialData> {
    const record = await this.credentialsService.findOne({
      id: credentialId,
      organizationId,
    });
    const credential = record
      ? toReplyBotCredentialData(record as unknown as Record<string, unknown>, {
          organizationId,
        })
      : null;
    if (!credential)
      throw new Error(`Reply-bot credential ${credentialId} not found`);
    return credential;
  }

  private async loadBotConfig(
    request: Pick<ReplyBotRequest, 'botConfigId' | 'organizationId'>,
  ): Promise<ReplyBotConfigDocument> {
    const botConfig = await this.replyBotConfigsService.findOneById(
      request.botConfigId,
      request.organizationId,
    );
    if (!botConfig)
      throw new Error(`Reply bot config ${request.botConfigId} not found`);
    return botConfig;
  }

  private readBotRequest(value: unknown): ReplyBotRequest {
    const request = this.readRecord(value);
    return {
      botConfigId: this.requiredString(request.botConfigId, 'botConfigId'),
      credentialId: this.requiredString(request.credentialId, 'credentialId'),
      organizationId: this.requiredString(
        request.organizationId,
        'organizationId',
      ),
    };
  }

  private readContentRequest(value: unknown): ReplyBotContentRequest {
    const request = this.readRecord(value);
    return {
      ...this.readBotRequest(request),
      content: request.content as SerializedReplyCandidate,
    };
  }

  private readContentState(
    input: Record<string, unknown>,
  ): ReplyBotContentState {
    const state = this.readRecord(input.state);
    return (
      Object.keys(state).length > 0 ? state : input
    ) as ReplyBotContentState;
  }

  private readDmRequest(value: unknown): ReplyBotDmRequest {
    const request = this.readRecord(value);
    const replyContentId =
      typeof request.replyContentId === 'string'
        ? request.replyContentId
        : undefined;
    const replyContentUrl =
      typeof request.replyContentUrl === 'string'
        ? request.replyContentUrl
        : undefined;
    const replyText =
      typeof request.replyText === 'string' ? request.replyText : undefined;
    return {
      ...this.readBotRequest(request),
      activityId: this.requiredString(request.activityId, 'activityId'),
      dmText: this.requiredString(request.dmText, 'dmText'),
      recipientId: this.requiredString(request.recipientId, 'recipientId'),
      ...(replyContentId === undefined ? {} : { replyContentId }),
      ...(replyContentUrl === undefined ? {} : { replyContentUrl }),
      ...(replyText === undefined ? {} : { replyText }),
    };
  }

  private readDmState(input: Record<string, unknown>): ReplyBotDmState {
    const state = this.readRecord(input.state);
    return (Object.keys(state).length > 0 ? state : input) as ReplyBotDmState;
  }

  private readForEachResult<T>(value: unknown): ForEachResult<T> {
    const result = this.readRecord(value);
    return {
      count: this.numberValue(result.count),
      results: Array.isArray(result.results)
        ? (result.results as ForEachResult<T>['results'])
        : [],
    };
  }

  private serializeCandidate(
    candidate: ReplyCandidate,
  ): SerializedReplyCandidate {
    return { ...candidate, createdAt: candidate.createdAt.toISOString() };
  }

  private deserializeCandidate(
    candidate: SerializedReplyCandidate,
  ): ReplyCandidate {
    return { ...candidate, createdAt: new Date(candidate.createdAt) };
  }

  private requireBotOwnerUserId(
    botConfig: ReplyBotConfigDocument,
    botConfigId: string,
  ): string {
    return requireRelationId(
      botConfig.userId,
      'userId',
      `Reply bot config ${botConfigId}`,
    );
  }

  private mergeReplyContext(
    botContext: string | undefined,
    candidateContext: string | undefined,
  ): string | undefined {
    return (
      [botContext, candidateContext].filter(Boolean).join('\n\n') || undefined
    );
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Reply bot action requires ${field}`);
    }
    return value;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private numberValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private errorMessage(error: unknown): string {
    this.loggerService.error('Reply bot workflow action failed', error);
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
