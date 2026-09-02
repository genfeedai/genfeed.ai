/**
 * Campaign Executor Service
 *
 * Handles the execution of campaign targets:
 * - Generates AI-powered replies
 * - Posts replies via platform APIs
 * - Handles rate limiting
 * - Tracks success/failure metrics
 */

import { type CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  CampaignAiConfig,
  type OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { readCampaignScheduleVersion } from '@api/collections/outreach-campaigns/services/outreach-campaign-schedule.util';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import {
  buildCampaignReplyBatchWorkflowDefinition,
  buildCampaignReplyPreviewWorkflowDefinition,
  buildCampaignReplyWorkflowDefinition,
  CAMPAIGN_REPLY_ACTION_IDS,
  CAMPAIGN_REPLY_BATCH_WORKFLOW_ID,
  CAMPAIGN_REPLY_PREVIEW_WORKFLOW_ID,
  CAMPAIGN_REPLY_WORKFLOW_ID,
} from '@api/services/campaign/campaign-reply-workflow-definition';
import { resolveCampaignScope } from '@api/services/campaign/campaign-scope.util';
import {
  isCampaignOutreachPairExecutable,
  requireExecutableOutreachPair,
} from '@api/services/campaign/outreach-capability.util';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import {
  type ReplyGenerationOptions,
  ReplyGenerationService,
} from '@api/services/reply-bot/reply-generation.service';
import { getOutreachCapabilityRefusal } from '@api-types/contracts/outreach-capabilities.contract';
import {
  CampaignPlatform,
  CampaignSkipReason,
  CampaignStatus,
  CampaignTargetStatus,
  ReplyLength,
  ReplyTone,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type {
  ICampaignScope,
  IReplyBotCredentialData,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, type OnModuleInit } from '@nestjs/common';

export interface ExecutionResult {
  success: boolean;
  replyText?: string;
  replyExternalId?: string;
  replyUrl?: string;
  error?: string;
  skipReason?: CampaignSkipReason;
}

type CampaignReplyWorkflowState = {
  campaignId: string;
  credentialId?: string;
  outcome?: ExecutionResult;
  organizationId: string;
  replyText?: string;
  sendResult?: {
    error?: string;
    success: boolean;
    tweetId?: string;
    tweetUrl?: string;
  };
  targetId: string;
};

@Injectable()
export class CampaignExecutorService implements OnModuleInit {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly campaignsService: OutreachCampaignsService,
    private readonly campaignTargetsService: CampaignTargetsService,
    private readonly credentialsService: CredentialsService,
    private readonly replyGenerationService: ReplyGenerationService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerWorkflow(
      buildCampaignReplyWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildCampaignReplyBatchWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildCampaignReplyPreviewWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.DISCOVER_TARGETS,
      (request) => this.discoverTargetsAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.CLAIM,
      (request) => this.claimTargetAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.LOAD_CONTEXT,
      (request) => this.loadContextAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.GENERATE,
      (request) => this.generateReplyAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.RESERVE,
      (request) => this.reserveReplyAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.SEND,
      (request) => this.sendReplyAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.FINALIZE,
      (request) => this.finalizeReplyAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.PREVIEW_VALIDATE,
      (request) => this.validatePreviewAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_REPLY_ACTION_IDS.PREVIEW_GENERATE,
      (request) => this.generatePreviewAction(request),
    );
  }

  /**
   * Execute a single target
   */
  async executeTarget(
    campaign: OutreachCampaignDocument,
    target: CampaignTargetDocument,
  ): Promise<ExecutionResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const campaignId = campaign.id.toString();
    const targetId = target.id.toString();

    try {
      const scope = resolveCampaignScope(campaign);
      const { result } =
        await this.systemWorkflowRunner.runWorkflow<ExecutionResult>({
          actionType: CAMPAIGN_REPLY_WORKFLOW_ID,
          canonicalId: CAMPAIGN_REPLY_WORKFLOW_ID,
          inputValues: {
            request: {
              campaignId,
              organizationId: scope.organizationId,
              targetId,
            },
          },
          organizationId: scope.organizationId,
          source: 'CampaignExecutorService.executeTarget',
          trigger: WorkflowExecutionTrigger.SCHEDULED,
          userId: scope.userId,
        });

      if (result.success) {
        this.loggerService.log(`${url} success`, {
          campaignId,
          replyId: result.replyExternalId,
          targetId,
        });
      }
      return result;
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      this.loggerService.error(`${url} failed`, {
        campaignId,
        error,
        targetId,
      });

      if (campaign.organizationId) {
        await this.campaignTargetsService.markAsFailed(
          targetId,
          campaign.organizationId,
          errorMessage,
          (target.retryCount || 0) + 1,
        );
        await this.campaignsService.incrementFailedCounter(
          campaignId,
          campaign.organizationId,
        );
      }

      return {
        error: errorMessage,
        success: false,
      };
    }
  }

  private async discoverTargetsAction(
    action: SystemWorkflowActionRequest,
  ): Promise<{
    interItemDelayMs: number;
    items: Array<{
      campaignId: string;
      organizationId: string;
      targetId: string;
    }>;
  }> {
    const request = this.readRecord(action.input.request);
    const campaignId = this.requiredString(request.campaignId, 'campaignId');
    const organizationId = this.requiredString(
      request.organizationId,
      'organizationId',
    );
    const campaign = await this.campaignsService.findOneById(
      campaignId,
      organizationId,
    );
    if (!campaign || campaign.status !== CampaignStatus.ACTIVE) {
      throw new Error(`Campaign ${campaignId} is not active`);
    }
    requireExecutableOutreachPair({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });
    const limit =
      typeof request.limit === 'number'
        ? Math.max(1, Math.min(100, Math.floor(request.limit)))
        : 10;
    const targets = await this.campaignTargetsService.getPendingTargets(
      campaignId,
      organizationId,
      limit,
      { scheduleVersion: readCampaignScheduleVersion(campaign.schedule) },
    );
    return {
      interItemDelayMs:
        Math.max(0, campaign.rateLimits?.delayBetweenRepliesSeconds ?? 0) *
        1000,
      items: targets.map((target) => ({
        campaignId,
        organizationId,
        targetId: target.id.toString(),
      })),
    };
  }

  private async claimTargetAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignReplyWorkflowState> {
    const state = this.readWorkflowRequest(action.input);
    const { campaign, target } = await this.loadWorkflowRecords(state);
    const refusal = getOutreachCapabilityRefusal({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });
    if (refusal) {
      return { ...state, outcome: { error: refusal.message, success: false } };
    }
    if (campaign.status !== CampaignStatus.ACTIVE) {
      await this.skipTarget(state, CampaignSkipReason.CAMPAIGN_PAUSED);
      return {
        ...state,
        outcome: {
          skipReason: CampaignSkipReason.CAMPAIGN_PAUSED,
          success: false,
        },
      };
    }
    if (
      !(await this.campaignsService.canReply(
        state.campaignId,
        state.organizationId,
      ))
    ) {
      await this.skipTarget(state, CampaignSkipReason.RATE_LIMITED);
      return {
        ...state,
        outcome: {
          skipReason: CampaignSkipReason.RATE_LIMITED,
          success: false,
        },
      };
    }
    const claimed = await this.campaignTargetsService.claimForProcessing(
      state.targetId,
      state.organizationId,
      { scheduleVersion: readCampaignScheduleVersion(campaign.schedule) },
    );
    if (!claimed) {
      return {
        ...state,
        outcome: {
          skipReason: CampaignSkipReason.CAMPAIGN_PAUSED,
          success: false,
        },
      };
    }
    return { ...state, targetId: target.id.toString() };
  }

  private async loadContextAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignReplyWorkflowState> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) return state;
    const { campaign } = await this.loadWorkflowRecords(state);
    const scope = resolveCampaignScope(campaign);
    const credential = await this.findCampaignCredential(scope);
    if (!credential) {
      return {
        ...state,
        outcome: { error: 'Credential not found', success: false },
      };
    }
    if (!toReplyBotCredentialData(credential as Record<string, unknown>)) {
      return {
        ...state,
        outcome: {
          error: 'Credential is missing an access token',
          success: false,
        },
      };
    }
    return { ...state, credentialId: String(credential.id) };
  }

  private async generateReplyAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignReplyWorkflowState> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) return state;
    const { campaign, target } = await this.loadWorkflowRecords(state);
    const replyText = await this.generateReply(
      campaign,
      target,
      resolveCampaignScope(campaign),
    );
    return { ...state, replyText };
  }

  private async reserveReplyAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignReplyWorkflowState> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) return state;
    const reservation = await this.campaignsService.reserveReplySlot(
      state.campaignId,
      state.organizationId,
    );
    if (reservation.reserved) return state;
    await this.skipTarget(
      state,
      CampaignSkipReason.RATE_LIMITED,
      CampaignTargetStatus.PROCESSING,
    );
    return {
      ...state,
      outcome: {
        skipReason: CampaignSkipReason.RATE_LIMITED,
        success: false,
      },
    };
  }

  private async sendReplyAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignReplyWorkflowState> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) return state;
    const { campaign, target } = await this.loadWorkflowRecords(state);
    const credentialRecord = await this.findCampaignCredential({
      credentialId: this.requiredString(state.credentialId, 'credentialId'),
      organizationId: state.organizationId,
    });
    const credential = credentialRecord
      ? toReplyBotCredentialData(
          credentialRecord as unknown as Record<string, unknown>,
          { organizationId: state.organizationId },
        )
      : null;
    if (!credential) {
      throw new Error('Campaign reply credential is unavailable');
    }
    const sendResult = await this.postReply(
      campaign.platform,
      credential,
      target,
      this.requiredString(state.replyText, 'replyText'),
    );
    return { ...state, sendResult };
  }

  private async finalizeReplyAction(
    action: SystemWorkflowActionRequest,
  ): Promise<ExecutionResult> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) {
      if (state.outcome.error && !state.outcome.skipReason) {
        await this.failTarget(state, state.outcome.error);
      }
      return state.outcome;
    }
    const postResult = state.sendResult;
    if (!postResult?.success) {
      const error = postResult?.error ?? 'Failed to post reply';
      await this.failTarget(state, error);
      return { error, success: false };
    }
    const replyText = this.requiredString(state.replyText, 'replyText');
    await this.campaignTargetsService.markAsReplied(
      state.targetId,
      state.organizationId,
      {
        replyExternalId: postResult.tweetId || '',
        replyText,
        replyUrl: postResult.tweetUrl || '',
      },
    );
    await this.campaignsService.incrementReplyCounters(
      state.campaignId,
      state.organizationId,
    );
    const replyExternalId = postResult.tweetId;
    const replyUrl = postResult.tweetUrl;
    return {
      replyText,
      ...(replyExternalId === undefined ? {} : { replyExternalId }),
      ...(replyUrl === undefined ? {} : { replyUrl }),
      success: true,
    };
  }

  private async loadWorkflowRecords(
    state: CampaignReplyWorkflowState,
  ): Promise<{
    campaign: OutreachCampaignDocument;
    target: CampaignTargetDocument;
  }> {
    const [campaign, target] = await Promise.all([
      this.campaignsService.findOneById(state.campaignId, state.organizationId),
      this.campaignTargetsService.findOne({
        id: state.targetId,
        organizationId: state.organizationId,
      }),
    ]);
    if (!campaign) throw new Error(`Campaign ${state.campaignId} not found`);
    if (!target) throw new Error(`Campaign target ${state.targetId} not found`);
    return {
      campaign: campaign as OutreachCampaignDocument,
      target: target as CampaignTargetDocument,
    };
  }

  private readWorkflowRequest(
    input: Record<string, unknown>,
  ): CampaignReplyWorkflowState {
    const request = this.readRecord(input.request);
    return {
      campaignId: this.requiredString(request.campaignId, 'campaignId'),
      organizationId: this.requiredString(
        request.organizationId,
        'organizationId',
      ),
      targetId: this.requiredString(request.targetId, 'targetId'),
    };
  }

  private readWorkflowState(
    input: Record<string, unknown>,
  ): CampaignReplyWorkflowState {
    const value = this.readRecord(input.state);
    const state = Object.keys(value).length > 0 ? value : input;
    return state as CampaignReplyWorkflowState;
  }

  private async skipTarget(
    state: CampaignReplyWorkflowState,
    reason: CampaignSkipReason,
    expectedStatus?: CampaignTargetStatus,
  ): Promise<void> {
    await this.campaignTargetsService.markAsSkipped(
      state.targetId,
      state.organizationId,
      reason,
      expectedStatus,
    );
    await this.campaignsService.incrementSkippedCounter(
      state.campaignId,
      state.organizationId,
    );
  }

  private async failTarget(
    state: CampaignReplyWorkflowState,
    error: string,
  ): Promise<void> {
    const target = await this.campaignTargetsService.findOne({
      id: state.targetId,
      organizationId: state.organizationId,
    });
    await this.campaignTargetsService.markAsFailed(
      state.targetId,
      state.organizationId,
      error,
      (target?.retryCount || 0) + 1,
    );
    await this.campaignsService.incrementFailedCounter(
      state.campaignId,
      state.organizationId,
    );
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Campaign reply action requires ${field}`);
    }
    return value;
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * Load the campaign's connected credential, scoped to its brand.
   *
   * The presence check keeps the lookup scoped when no credential is configured.
   */
  private findCampaignCredential({
    brandId,
    credentialId,
    organizationId,
  }: ICampaignScope) {
    if (!credentialId) {
      return null;
    }

    return this.credentialsService.findOne(
      scopedWhere(organizationId, {
        id: credentialId,
        ...(brandId ? { brandId } : {}),
      }),
    );
  }

  /**
   * Generate a reply for a target
   */
  private generateReply(
    campaign: OutreachCampaignDocument,
    target: CampaignTargetDocument,
    // Resolved from the scalar FKs by the caller so this method never re-reads
    // `campaign.organization` / `campaign.user`.
    owner: ICampaignScope,
  ): Promise<string> | string {
    const aiConfig = campaign.aiConfig || ({} as CampaignAiConfig);

    // If not using AI generation, use template
    if (!aiConfig.useAiGeneration && aiConfig.templateText) {
      return this.processTemplate(aiConfig.templateText, target);
    }

    // Generate AI reply
    const options: ReplyGenerationOptions = {
      context: aiConfig.context,
      customInstructions: this.buildCustomInstructions(aiConfig, target),
      length: this.normalizeReplyLength(aiConfig.length),
      organizationId: owner.organizationId,
      tone: this.normalizeReplyTone(aiConfig.tone),
      tweetAuthor: this.asString(target.authorUsername) ?? 'unknown',
      tweetContent: this.asString(target.contentText) ?? '',
      userId: owner.userId || '',
    };

    return this.replyGenerationService.generateReply(options);
  }

  /**
   * Build custom instructions for AI generation
   */
  private buildCustomInstructions(
    aiConfig: CampaignAiConfig,
    target: CampaignTargetDocument,
  ): string {
    const instructions: string[] = [];

    if (aiConfig.customInstructions) {
      instructions.push(aiConfig.customInstructions);
    }

    if (aiConfig.ctaLink) {
      instructions.push(
        `Include this link in your reply when appropriate: ${aiConfig.ctaLink}`,
      );
    }

    if (target.matchedKeyword) {
      instructions.push(
        `The content was discovered because it relates to: ${target.matchedKeyword}`,
      );
    }

    return instructions.join('\n');
  }

  /**
   * Process a template with target data
   */
  private processTemplate(
    template: string,
    target: CampaignTargetDocument,
  ): string {
    return template
      .replace(/\{\{author\}\}/g, this.asString(target.authorUsername) ?? '')
      .replace(/\{\{content\}\}/g, this.asString(target.contentText) ?? '')
      .replace(/\{\{keyword\}\}/g, this.asString(target.matchedKeyword) ?? '');
  }

  /**
   * Post a reply to the target platform
   */
  private postReply(
    platform: OutreachCampaignDocument['platform'],
    credential: IReplyBotCredentialData,
    target: CampaignTargetDocument,
    replyText: string,
  ):
    | Promise<{
        success: boolean;
        tweetId?: string;
        tweetUrl?: string;
        error?: string;
      }>
    | {
        success: boolean;
        tweetId?: string;
        tweetUrl?: string;
        error?: string;
      } {
    switch (this.normalizeCampaignPlatform(platform)) {
      case CampaignPlatform.TWITTER:
        return this.botActionExecutorService
          .postReply(
            credential,
            {
              authorId: this.asString(target.authorId) ?? '',
              authorUsername: this.asString(target.authorUsername) ?? '',
              createdAt: this.asDate(target.contentCreatedAt),
              id: this.asString(target.externalId) ?? '',
              text: this.asString(target.contentText) ?? '',
            },
            replyText,
          )
          .then((replyResult) => {
            const error = replyResult.error;
            const tweetId =
              replyResult.contentId ??
              (replyResult as unknown as { tweetId?: string }).tweetId;
            const tweetUrl =
              replyResult.contentUrl ??
              (replyResult as unknown as { tweetUrl?: string }).tweetUrl;
            return {
              ...(error === undefined ? {} : { error }),
              success: replyResult.success,
              ...(tweetId === undefined ? {} : { tweetId }),
              ...(tweetUrl === undefined ? {} : { tweetUrl }),
            };
          });

      case CampaignPlatform.REDDIT:
        // Reddit reply would be implemented similarly
        // For now, return error as Reddit requires different API
        return {
          error: 'Reddit replies not yet implemented',
          success: false,
        };

      default:
        return {
          error: `Unsupported platform: ${platform ?? 'unknown'}`,
          success: false,
        };
    }
  }

  /**
   * Preview a reply without posting
   */
  async previewReply(
    campaign: OutreachCampaignDocument,
    target: CampaignTargetDocument,
  ): Promise<string> {
    const scope = resolveCampaignScope(campaign);
    const { result } = await this.systemWorkflowRunner.runWorkflow<string>({
      actionType: CAMPAIGN_REPLY_PREVIEW_WORKFLOW_ID,
      canonicalId: CAMPAIGN_REPLY_PREVIEW_WORKFLOW_ID,
      inputValues: {
        request: {
          campaignId: campaign.id.toString(),
          organizationId: scope.organizationId,
          targetId: target.id.toString(),
        },
      },
      organizationId: scope.organizationId,
      source: 'CampaignExecutorService.previewReply',
      trigger: WorkflowExecutionTrigger.API,
      userId: scope.userId,
    });
    return result;
  }

  private async validatePreviewAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignReplyWorkflowState> {
    const state = this.readWorkflowRequest(action.input);
    const { campaign } = await this.loadWorkflowRecords(state);
    requireExecutableOutreachPair({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });
    return state;
  }

  private async generatePreviewAction(
    action: SystemWorkflowActionRequest,
  ): Promise<string> {
    const state = this.readWorkflowState(action.input);
    const { campaign, target } = await this.loadWorkflowRecords(state);
    return this.generateReply(campaign, target, resolveCampaignScope(campaign));
  }

  /**
   * Process multiple pending targets for a campaign
   */
  async processPendingTargets(
    campaign: OutreachCampaignDocument,
    limit: number = 10,
  ): Promise<{
    processed: number;
    successful: number;
    failed: number;
    skipped: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (
        !isCampaignOutreachPairExecutable({
          campaignType: campaign.campaignType,
          platform: campaign.platform,
        })
      ) {
        this.loggerService.log(`${url} skipped unavailable pair`, {
          campaignId: campaign.id,
          campaignType: campaign.campaignType,
          platform: campaign.platform,
        });
        return { failed: 0, processed: 0, skipped: 0, successful: 0 };
      }

      if (!campaign.organizationId) {
        this.loggerService.error(`${url} failed`, {
          campaignId: campaign.id,
          reason: 'organization_id_required',
        });
        return { failed: 0, processed: 0, skipped: 0, successful: 0 };
      }
      const { result } = await this.systemWorkflowRunner.runWorkflow<{
        count: number;
        results: Array<{ index: number; jobId: string }>;
      }>({
        actionType: CAMPAIGN_REPLY_BATCH_WORKFLOW_ID,
        canonicalId: CAMPAIGN_REPLY_BATCH_WORKFLOW_ID,
        inputValues: {
          request: {
            campaignId: campaign.id.toString(),
            limit,
            organizationId: campaign.organizationId,
          },
        },
        organizationId: campaign.organizationId,
        source: 'CampaignExecutorService.processPendingTargets',
        trigger: WorkflowExecutionTrigger.SCHEDULED,
        userId: resolveCampaignScope(campaign).userId,
      });
      const results = {
        failed: 0,
        processed: result.count,
        skipped: 0,
        successful: 0,
      };

      this.loggerService.log(`${url} batch complete`, {
        campaignId: campaign.id,
        ...results,
      });

      return results;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        campaignId: campaign.id,
        error,
      });
      throw error;
    }
  }

  private normalizeCampaignPlatform(
    platform: OutreachCampaignDocument['platform'],
  ): CampaignPlatform | null {
    switch (platform) {
      case CampaignPlatform.REDDIT:
      case CampaignPlatform.TWITTER:
        return platform;
      default:
        return null;
    }
  }

  private normalizeReplyLength(value: CampaignAiConfig['length']): ReplyLength {
    switch (value) {
      case ReplyLength.LONG:
      case ReplyLength.MEDIUM:
      case ReplyLength.SHORT:
        return value;
      default:
        return ReplyLength.MEDIUM;
    }
  }

  private normalizeReplyTone(value: CampaignAiConfig['tone']): ReplyTone {
    switch (value) {
      case ReplyTone.CASUAL:
      case ReplyTone.ENGAGING:
      case ReplyTone.FRIENDLY:
      case ReplyTone.HUMOROUS:
      case ReplyTone.INFORMATIVE:
      case ReplyTone.PROFESSIONAL:
      case ReplyTone.SUPPORTIVE:
        return value;
      default:
        return ReplyTone.FRIENDLY;
    }
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private asDate(value: unknown): Date {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  }
}
