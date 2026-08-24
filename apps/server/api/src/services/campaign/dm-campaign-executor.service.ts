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
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { resolveCampaignScope } from '@api/services/campaign/campaign-scope.util';
import { isCampaignOutreachPairExecutable } from '@api/services/campaign/outreach-capability.util';
import { toReplyBotCredentialData } from '@api/services/campaign/reply-bot-credential.util';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import { getOutreachCapabilityRefusal } from '@api-types/contracts/outreach-capabilities.contract';
import {
  CampaignSkipReason,
  CampaignStatus,
  CampaignTargetStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type { ICampaignScope } from '@genfeedai/interfaces';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DmCampaignExecutorService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly campaignsService: OutreachCampaignsService,
    private readonly campaignTargetsService: CampaignTargetsService,
    private readonly credentialsService: CredentialsService,
    private readonly replyGenerationService: ReplyGenerationService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
  ) {}

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

    const results = {
      failed: 0,
      processed: 0,
      skipped: 0,
      successful: 0,
    };

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
        return results;
      }

      if (!campaign.organizationId) {
        this.loggerService.error(`${url} failed`, {
          campaignId,
          reason: 'organization_id_required',
        });
        return results;
      }

      const pendingTargets =
        await this.campaignTargetsService.getPendingTargets(
          campaignId,
          campaign.organizationId,
          limit,
        );

      for (const target of pendingTargets) {
        const result = await this.executeDmTarget(campaign, target);
        results.processed++;

        if (result.success) {
          results.successful++;
        } else if (result.skipReason) {
          results.skipped++;
        } else {
          results.failed++;
        }

        // Add delay between DMs
        if (campaign.rateLimits?.delayBetweenRepliesSeconds) {
          await this.delay(
            campaign.rateLimits.delayBetweenRepliesSeconds * 1000,
          );
        }
      }

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

  /**
   * Execute a single DM target
   */
  private async executeDmTarget(
    campaign: OutreachCampaignDocument,
    target: CampaignTargetDocument,
  ): Promise<{
    success: boolean;
    error?: string;
    skipReason?: CampaignSkipReason;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const campaignId = this.getCampaignId(campaign);
    const targetId = this.getTargetId(target);

    try {
      const refusal = getOutreachCapabilityRefusal({
        campaignType: campaign.campaignType,
        platform: campaign.platform,
      });
      if (refusal) {
        return {
          error: refusal.message,
          success: false,
        };
      }

      if (campaign.status !== CampaignStatus.ACTIVE) {
        if (campaign.organizationId) {
          await this.campaignTargetsService.markAsSkipped(
            targetId,
            campaign.organizationId,
            CampaignSkipReason.CAMPAIGN_PAUSED,
          );
          await this.campaignsService.incrementSkippedCounter(
            campaignId,
            campaign.organizationId,
          );
        }
        return {
          skipReason: CampaignSkipReason.CAMPAIGN_PAUSED,
          success: false,
        };
      }

      const scope = resolveCampaignScope(campaign);

      // Check rate limits
      const canReply = await this.campaignsService.canReply(
        campaignId,
        scope.organizationId,
      );
      if (!canReply) {
        await this.campaignTargetsService.markAsSkipped(
          targetId,
          scope.organizationId,
          CampaignSkipReason.RATE_LIMITED,
        );
        await this.campaignsService.incrementSkippedCounter(
          campaignId,
          scope.organizationId,
        );
        return { skipReason: CampaignSkipReason.RATE_LIMITED, success: false };
      }

      const claimed = await this.campaignTargetsService.claimForProcessing(
        targetId,
        scope.organizationId,
      );
      if (!claimed) {
        return {
          skipReason: CampaignSkipReason.CAMPAIGN_PAUSED,
          success: false,
        };
      }

      // Get credential
      const credential = await this.findCampaignCredential(scope);

      if (!credential) {
        const errorMessage = 'Credential not found';
        await this.campaignTargetsService.markAsFailed(
          targetId,
          scope.organizationId,
          errorMessage,
        );
        await this.campaignsService.incrementFailedCounter(
          campaignId,
          scope.organizationId,
        );
        return { error: errorMessage, success: false };
      }

      const credentialData = toReplyBotCredentialData(
        credential as Record<string, unknown>,
      );

      if (!credentialData) {
        const errorMessage = 'Credential is missing an access token';
        await this.campaignTargetsService.markAsFailed(
          targetId,
          scope.organizationId,
          errorMessage,
        );
        await this.campaignsService.incrementFailedCounter(
          campaignId,
          scope.organizationId,
        );
        return { error: errorMessage, success: false };
      }

      // Resolve username to userId if needed
      let recipientUserId = target.recipientUserId;
      if (!recipientUserId && target.recipientUsername) {
        recipientUserId =
          await this.botActionExecutorService.resolveTwitterUserId(
            credentialData,
            target.recipientUsername,
          );

        if (!recipientUserId) {
          const errorMessage = `User not found: @${target.recipientUsername}`;
          await this.campaignTargetsService.markAsSkipped(
            targetId,
            scope.organizationId,
            CampaignSkipReason.USER_NOT_FOUND,
            CampaignTargetStatus.PROCESSING,
          );
          await this.campaignsService.incrementSkippedCounter(
            campaignId,
            scope.organizationId,
          );
          return {
            error: errorMessage,
            skipReason: CampaignSkipReason.USER_NOT_FOUND,
            success: false,
          };
        }

        await this.campaignTargetsService.updateOne(
          targetId,
          scope.organizationId,
          { recipientUserId },
        );
      }

      if (!recipientUserId) {
        const errorMessage = 'No recipient username or userId';
        await this.campaignTargetsService.markAsFailed(
          targetId,
          scope.organizationId,
          errorMessage,
        );
        await this.campaignsService.incrementFailedCounter(
          campaignId,
          scope.organizationId,
        );
        return { error: errorMessage, success: false };
      }

      // Generate DM text
      const dmText = await this.generateDmText(
        campaign,
        target.recipientUsername || '',
        scope,
      );

      // Send DM
      const { result: dmResult } =
        await this.systemWorkflowProvenanceService.runAction(
          {
            actionType: 'campaign-dm',
            canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.CAMPAIGN_DM_AUTOMATION,
            description:
              'Generates and sends outreach campaign DMs through connected brand credentials.',
            failureMessage: (result) =>
              result.success ? undefined : result.error || 'Campaign DM failed',
            inputValues: {
              campaignId,
              recipientUserId,
              targetId,
            },
            label: 'Campaign DM Automation',
            organizationId: scope.organizationId,
            source: 'DmCampaignExecutorService.executeDmTarget',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
            userId: scope.userId,
          },
          () =>
            this.botActionExecutorService.sendDm(
              credentialData,
              recipientUserId,
              dmText,
            ),
        );

      if (!dmResult.success) {
        const isDmNotAllowed =
          dmResult.error?.includes('cannot send messages') ||
          dmResult.error?.includes('Direct message');

        if (isDmNotAllowed) {
          await this.campaignTargetsService.markAsSkipped(
            targetId,
            scope.organizationId,
            CampaignSkipReason.DM_NOT_ALLOWED,
            CampaignTargetStatus.PROCESSING,
          );
          await this.campaignsService.incrementSkippedCounter(
            campaignId,
            scope.organizationId,
          );
          return {
            error: dmResult.error,
            skipReason: CampaignSkipReason.DM_NOT_ALLOWED,
            success: false,
          };
        }

        await this.campaignTargetsService.markAsFailed(
          targetId,
          scope.organizationId,
          dmResult.error || 'Failed to send DM',
          (target.retryCount || 0) + 1,
        );
        await this.campaignsService.incrementFailedCounter(
          campaignId,
          scope.organizationId,
        );
        return { error: dmResult.error, success: false };
      }

      await this.campaignTargetsService.markAsSent(
        targetId,
        scope.organizationId,
        {
          dmText,
        },
      );

      await this.campaignsService.incrementDmCounter(
        campaignId,
        scope.organizationId,
      );

      this.loggerService.log(`${url} DM sent`, {
        campaignId,
        recipientUsername: target.recipientUsername,
        targetId,
      });

      return { success: true };
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

      return { error: errorMessage, success: false };
    }
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

  private getTargetId(target: CampaignTargetDocument): string {
    return String(target.id);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
