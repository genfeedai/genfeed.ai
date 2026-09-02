/**
 * DM Campaign Executor Service
 *
 * Handles DM outreach campaigns: generates DM text, resolves usernames
 * to user IDs, sends DMs, and tracks status.
 */

import { type CampaignTargetDocument } from '@api/collections/campaign-targets/schemas/campaign-target.schema';
import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import {
  CampaignDmConfig,
  type OutreachCampaignDocument,
} from '@api/collections/outreach-campaigns/schemas/outreach-campaign.schema';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import {
  type SystemWorkflowActionRequest,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { scopedWhere } from '@api/index';
import {
  buildCampaignDmBatchWorkflowDefinition,
  buildCampaignDmWorkflowDefinition,
  CAMPAIGN_DM_ACTION_IDS,
  CAMPAIGN_DM_BATCH_WORKFLOW_ID,
} from '@api/services/campaign/campaign-dm-workflow-definition';
import { resolveCampaignScope } from '@api/services/campaign/campaign-scope.util';
import { isCampaignOutreachPairExecutable } from '@api/services/campaign/outreach-capability.util';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  CampaignSkipReason,
  CampaignStatus,
  CampaignTargetStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import { getOutreachCapabilityRefusal } from '@genfeedai/contracts/api-types/contracts/outreach-capabilities.contract';
import type { ICampaignScope } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, type OnModuleInit } from '@nestjs/common';

type DmExecutionResult = {
  success: boolean;
  error?: string;
  skipReason?: CampaignSkipReason;
};

type CampaignDmWorkflowState = {
  campaignId: string;
  credentialId?: string;
  dmText?: string;
  organizationId: string;
  outcome?: DmExecutionResult;
  recipientUserId?: string;
  sendResult?: { error?: string; success: boolean };
  targetId: string;
};

@Injectable()
export class DmCampaignExecutorService implements OnModuleInit {
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
      buildCampaignDmWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildCampaignDmBatchWorkflowDefinition(),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_DM_ACTION_IDS.DISCOVER_TARGETS,
      (request) => this.discoverTargetsAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_DM_ACTION_IDS.CLAIM,
      (request) => this.claimTargetAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_DM_ACTION_IDS.RESOLVE_CONTEXT,
      (request) => this.resolveContextAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_DM_ACTION_IDS.GENERATE,
      (request) => this.generateDmAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_DM_ACTION_IDS.RESERVE,
      (request) => this.reserveDmAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_DM_ACTION_IDS.SEND,
      (request) => this.sendDmAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      CAMPAIGN_DM_ACTION_IDS.FINALIZE,
      (request) => this.finalizeDmAction(request),
    );
  }

  /**
   * Process pending DM targets for a campaign
   */
  async processPendingDmTargets(
    campaign: OutreachCampaignDocument,
    limit: number = 10,
  ): Promise<{
    processed: number;
    successful: number;
    failed: number;
    skipped: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const campaignId = this.getCampaignId(campaign);

    try {
      if (
        !isCampaignOutreachPairExecutable({
          campaignType: campaign.campaignType,
          platform: campaign.platform,
        })
      ) {
        this.loggerService.log(`${url} skipped unavailable pair`, {
          campaignId,
          campaignType: campaign.campaignType,
          platform: campaign.platform,
        });
        return { failed: 0, processed: 0, skipped: 0, successful: 0 };
      }

      if (!campaign.organizationId) {
        this.loggerService.error(`${url} failed`, {
          campaignId,
          reason: 'organization_id_required',
        });
        return { failed: 0, processed: 0, skipped: 0, successful: 0 };
      }
      const { result } = await this.systemWorkflowRunner.runWorkflow<{
        count: number;
        results: Array<{ index: number; jobId: string }>;
      }>({
        actionType: CAMPAIGN_DM_BATCH_WORKFLOW_ID,
        canonicalId: CAMPAIGN_DM_BATCH_WORKFLOW_ID,
        inputValues: {
          request: {
            campaignId,
            limit,
            organizationId: campaign.organizationId,
          },
        },
        organizationId: campaign.organizationId,
        source: 'DmCampaignExecutorService.processPendingDmTargets',
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
        campaignId,
        ...results,
      });

      return results;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        campaignId,
        error,
      });
      throw error;
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
    if (
      !isCampaignOutreachPairExecutable({
        campaignType: campaign.campaignType,
        platform: campaign.platform,
      })
    ) {
      throw new Error(`Campaign ${campaignId} outreach pair is unavailable`);
    }
    const limit =
      typeof request.limit === 'number'
        ? Math.max(1, Math.min(100, Math.floor(request.limit)))
        : 10;
    const targets = await this.campaignTargetsService.getPendingTargets(
      campaignId,
      organizationId,
      limit,
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
  ): Promise<CampaignDmWorkflowState> {
    const state = this.readWorkflowRequest(action.input);
    const { campaign } = await this.loadWorkflowRecords(state);
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
    );
    return claimed
      ? state
      : {
          ...state,
          outcome: {
            skipReason: CampaignSkipReason.CAMPAIGN_PAUSED,
            success: false,
          },
        };
  }

  private async resolveContextAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignDmWorkflowState> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) return state;
    const { campaign, target } = await this.loadWorkflowRecords(state);
    const scope = resolveCampaignScope(campaign);
    const credentialRecord = await this.findCampaignCredential(scope);
    const credential = credentialRecord
      ? toReplyBotCredentialData(
          credentialRecord as unknown as Record<string, unknown>,
          { organizationId: state.organizationId },
        )
      : null;
    if (!credential || !credentialRecord) {
      return {
        ...state,
        outcome: {
          error: credentialRecord
            ? 'Credential is missing an access token'
            : 'Credential not found',
          success: false,
        },
      };
    }
    let recipientUserId = target.recipientUserId ?? undefined;
    if (!recipientUserId && target.recipientUsername) {
      recipientUserId =
        (await this.botActionExecutorService.resolveTwitterUserId(
          credential,
          target.recipientUsername,
        )) ?? undefined;
      if (recipientUserId) {
        await this.campaignTargetsService.updateOne(
          state.targetId,
          state.organizationId,
          { recipientUserId },
        );
      }
    }
    if (!recipientUserId) {
      const error = target.recipientUsername
        ? `User not found: @${target.recipientUsername}`
        : 'No recipient username or userId';
      if (target.recipientUsername) {
        await this.skipTarget(
          state,
          CampaignSkipReason.USER_NOT_FOUND,
          CampaignTargetStatus.PROCESSING,
        );
        return {
          ...state,
          outcome: {
            error,
            skipReason: CampaignSkipReason.USER_NOT_FOUND,
            success: false,
          },
        };
      }
      return { ...state, outcome: { error, success: false } };
    }
    return {
      ...state,
      credentialId: String(credentialRecord.id),
      recipientUserId,
    };
  }

  private async generateDmAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignDmWorkflowState> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) return state;
    const { campaign, target } = await this.loadWorkflowRecords(state);
    const dmText = await this.generateDmText(
      campaign,
      target.recipientUsername || '',
      resolveCampaignScope(campaign),
    );
    return { ...state, dmText };
  }

  private async reserveDmAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignDmWorkflowState> {
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

  private async sendDmAction(
    action: SystemWorkflowActionRequest,
  ): Promise<CampaignDmWorkflowState> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) return state;
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
    if (!credential) throw new Error('Campaign DM credential is unavailable');
    const sendResult = await this.botActionExecutorService.sendDm(
      credential,
      this.requiredString(state.recipientUserId, 'recipientUserId'),
      this.requiredString(state.dmText, 'dmText'),
    );
    return { ...state, sendResult };
  }

  private async finalizeDmAction(
    action: SystemWorkflowActionRequest,
  ): Promise<DmExecutionResult> {
    const state = this.readWorkflowState(action.input);
    if (state.outcome) {
      if (state.outcome.error && !state.outcome.skipReason) {
        await this.failTarget(state, state.outcome.error);
      }
      return state.outcome;
    }
    const result = state.sendResult;
    if (!result?.success) {
      const error = result?.error ?? 'Failed to send DM';
      const isNotAllowed =
        error.includes('cannot send messages') ||
        error.includes('Direct message');
      if (isNotAllowed) {
        await this.skipTarget(
          state,
          CampaignSkipReason.DM_NOT_ALLOWED,
          CampaignTargetStatus.PROCESSING,
        );
        return {
          error,
          skipReason: CampaignSkipReason.DM_NOT_ALLOWED,
          success: false,
        };
      }
      await this.failTarget(state, error);
      return { error, success: false };
    }
    await this.campaignTargetsService.markAsSent(
      state.targetId,
      state.organizationId,
      { dmText: this.requiredString(state.dmText, 'dmText') },
    );
    await this.campaignsService.incrementDmCounter(
      state.campaignId,
      state.organizationId,
    );
    return { success: true };
  }

  private async loadWorkflowRecords(state: CampaignDmWorkflowState): Promise<{
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
  ): CampaignDmWorkflowState {
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
  ): CampaignDmWorkflowState {
    const state = this.readRecord(input.state);
    return (
      Object.keys(state).length > 0 ? state : input
    ) as CampaignDmWorkflowState;
  }

  private async skipTarget(
    state: CampaignDmWorkflowState,
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
    state: CampaignDmWorkflowState,
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

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Campaign DM action requires ${field}`);
    }
    return value;
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
   * Generate DM text using AI or template
   */
  private generateDmText(
    campaign: OutreachCampaignDocument,
    recipientUsername: string,
    // Resolved from the scalar FKs by the caller so this method never re-reads
    // `campaign.organization` / `campaign.user`.
    owner: ICampaignScope,
  ): Promise<string> | string {
    const dmConfig = campaign.dmConfig || ({} as CampaignDmConfig);

    // If not using AI, process template
    if (!dmConfig.useAiGeneration && dmConfig.templateText) {
      return dmConfig.templateText
        .replace(/\{\{username\}\}/g, recipientUsername)
        .replace(/\{\{offer\}\}/g, dmConfig.offer || '')
        .replace(/\{\{cta\}\}/g, dmConfig.ctaLink || '');
    }

    // Build AI instructions
    const instructions = [
      dmConfig.customInstructions,
      dmConfig.offer ? `The offer: ${dmConfig.offer}` : '',
      dmConfig.ctaLink ? `Include this link: ${dmConfig.ctaLink}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return this.replyGenerationService.generateDm({
      context: dmConfig.context,
      customInstructions: instructions || undefined,
      organizationId: owner.organizationId,
      replyText: '',
      tweetAuthor: recipientUsername,
      tweetContent: '',
      userId: owner.userId || '',
    });
  }

  private getCampaignId(campaign: OutreachCampaignDocument): string {
    return String(campaign.id);
  }
}
