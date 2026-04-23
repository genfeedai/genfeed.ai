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
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  CampaignSkipReason,
  CampaignStatus,
  CampaignTargetStatus,
} from '@genfeedai/enums';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
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
      const pendingTargets =
        await this.campaignTargetsService.getPendingTargets(campaignId, limit);

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
      // Check if campaign is still active
      if (campaign.status !== CampaignStatus.ACTIVE) {
        await this.campaignTargetsService.markAsSkipped(
          targetId,
          CampaignSkipReason.CAMPAIGN_PAUSED,
        );
        await this.campaignsService.incrementSkippedCounter(campaignId);
        return {
          skipReason: CampaignSkipReason.CAMPAIGN_PAUSED,
          success: false,
        };
      }

      // Check rate limits
      const canReply = await this.campaignsService.canReply(
        campaignId,
        campaign.organization,
      );
      if (!canReply) {
        await this.campaignTargetsService.markAsSkipped(
          targetId,
          CampaignSkipReason.RATE_LIMITED,
        );
        await this.campaignsService.incrementSkippedCounter(campaignId);
        return { skipReason: CampaignSkipReason.RATE_LIMITED, success: false };
      }

      // Mark as processing
      await this.campaignTargetsService.markAsProcessing(targetId);

      // Get credential
      const credential = await this.credentialsService.findOne({
        _id: campaign.credential,
        isDeleted: false,
      });

      if (!credential) {
        const errorMessage = 'Credential not found';
        await this.campaignTargetsService.markAsFailed(targetId, errorMessage);
        await this.campaignsService.incrementFailedCounter(campaignId);
        return { error: errorMessage, success: false };
      }

      const credentialData = this.toReplyBotCredentialData(
        credential as Record<string, unknown>,
      );

      if (!credentialData) {
        const errorMessage = 'Credential is missing an access token';
        await this.campaignTargetsService.markAsFailed(targetId, errorMessage);
        await this.campaignsService.incrementFailedCounter(campaignId);
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
            CampaignSkipReason.USER_NOT_FOUND,
          );
          await this.campaignsService.incrementSkippedCounter(campaignId);
          return {
            error: errorMessage,
            skipReason: CampaignSkipReason.USER_NOT_FOUND,
            success: false,
          };
        }

        // Cache the resolved userId back to target
        await this.campaignTargetsService.updateOne(targetId, {
          recipientUserId,
        });
      }

      if (!recipientUserId) {
        const errorMessage = 'No recipient username or userId';
        await this.campaignTargetsService.markAsFailed(targetId, errorMessage);
        await this.campaignsService.incrementFailedCounter(campaignId);
        return { error: errorMessage, success: false };
      }

      // Generate DM text
      const dmText = await this.generateDmText(
        campaign,
        target.recipientUsername || '',
      );

      // Send DM
      const dmResult = await this.botActionExecutorService.sendDm(
        credentialData,
        recipientUserId,
        dmText,
      );

      if (!dmResult.success) {
        const isDmNotAllowed =
          dmResult.error?.includes('cannot send messages') ||
          dmResult.error?.includes('Direct message');

        if (isDmNotAllowed) {
          await this.campaignTargetsService.markAsSkipped(
            targetId,
            CampaignSkipReason.DM_NOT_ALLOWED,
          );
          await this.campaignsService.incrementSkippedCounter(campaignId);
          return {
            error: dmResult.error,
            skipReason: CampaignSkipReason.DM_NOT_ALLOWED,
            success: false,
          };
        }

        await this.campaignTargetsService.markAsFailed(
          targetId,
          dmResult.error || 'Failed to send DM',
          (target.retryCount || 0) + 1,
        );
        await this.campaignsService.incrementFailedCounter(campaignId);
        return { error: dmResult.error, success: false };
      }

      // Mark as sent
      await this.campaignTargetsService.updateOne(targetId, {
        dmSentAt: new Date(),
        dmText,
        processedAt: new Date(),
        status: CampaignTargetStatus.SENT,
      });

      // Update campaign counters
      await this.campaignsService.incrementDmCounter(campaignId);

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

      await this.campaignTargetsService.markAsFailed(
        targetId,
        errorMessage,
        (target.retryCount || 0) + 1,
      );
      await this.campaignsService.incrementFailedCounter(campaignId);

      return { error: errorMessage, success: false };
    }
  }

  /**
   * Generate DM text using AI or template
   */
  private generateDmText(
    campaign: OutreachCampaignDocument,
    recipientUsername: string,
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
      organizationId: campaign.organization.toString(),
      replyText: '',
      tweetAuthor: recipientUsername,
      tweetContent: '',
      userId: campaign.user?.toString() || '',
    });
  }

  private getCampaignId(campaign: OutreachCampaignDocument): string {
    return String(campaign.id ?? campaign._id);
  }

  private getTargetId(target: CampaignTargetDocument): string {
    return String(target.id ?? target._id);
  }

  private toReplyBotCredentialData(
    credential: Record<string, unknown>,
  ): IReplyBotCredentialData | null {
    if (typeof credential.accessToken !== 'string') {
      return null;
    }

    return {
      accessToken: credential.accessToken,
      accessTokenSecret:
        typeof credential.accessTokenSecret === 'string'
          ? credential.accessTokenSecret
          : undefined,
      externalId:
        typeof credential.externalId === 'string'
          ? credential.externalId
          : undefined,
      platform:
        credential.platform === null || credential.platform === undefined
          ? undefined
          : (String(
              credential.platform,
            ) as IReplyBotCredentialData['platform']),
      refreshToken:
        typeof credential.refreshToken === 'string'
          ? credential.refreshToken
          : undefined,
      username:
        typeof credential.username === 'string'
          ? credential.username
          : undefined,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
