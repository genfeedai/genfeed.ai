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

    const results = {
      failed: 0,
      processed: 0,
      skipped: 0,
      successful: 0,
    };

    try {
      const pendingTargets =
        await this.campaignTargetsService.getPendingTargets(
          campaign._id.toString(),
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
        campaignId: campaign._id,
        ...results,
      });

      return results;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        campaignId: campaign._id,
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

    try {
      // Check if campaign is still active
      if (campaign.status !== CampaignStatus.ACTIVE) {
        await this.campaignTargetsService.markAsSkipped(
          target._id.toString(),
          CampaignSkipReason.CAMPAIGN_PAUSED,
        );
        await this.campaignsService.incrementSkippedCounter(
          campaign._id.toString(),
        );
        return {
          skipReason: CampaignSkipReason.CAMPAIGN_PAUSED,
          success: false,
        };
      }

      // Check rate limits
      // @ts-expect-error TS2554
      const canReply = await this.campaignsService.canReply(
        campaign._id.toString(),
      );
      if (!canReply) {
        await this.campaignTargetsService.markAsSkipped(
          target._id.toString(),
          CampaignSkipReason.RATE_LIMITED,
        );
        await this.campaignsService.incrementSkippedCounter(
          campaign._id.toString(),
        );
        return { skipReason: CampaignSkipReason.RATE_LIMITED, success: false };
      }

      // Mark as processing
      await this.campaignTargetsService.markAsProcessing(target._id.toString());

      // Get credential
      const credential = await this.credentialsService.findOne({
        _id: campaign.credential,
        isDeleted: false,
      });

      if (!credential) {
        const errorMessage = 'Credential not found';
        await this.campaignTargetsService.markAsFailed(
          target._id.toString(),
          errorMessage,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign._id.toString(),
        );
        return { error: errorMessage, success: false };
      }

      // Resolve username to userId if needed
      let recipientUserId = target.recipientUserId;
      if (!recipientUserId && target.recipientUsername) {
        // @ts-expect-error TS2322
        recipientUserId =
          await this.botActionExecutorService.resolveTwitterUserId(
            {
              accessToken: credential.accessToken,
              accessTokenSecret: credential.accessTokenSecret,
              externalId: credential.externalId,
              refreshToken: credential.refreshToken,
              username: credential.username,
            },
            target.recipientUsername,
          );

        if (!recipientUserId) {
          const errorMessage = `User not found: @${target.recipientUsername}`;
          await this.campaignTargetsService.markAsSkipped(
            target._id.toString(),
            CampaignSkipReason.USER_NOT_FOUND,
          );
          await this.campaignsService.incrementSkippedCounter(
            campaign._id.toString(),
          );
          return {
            error: errorMessage,
            skipReason: CampaignSkipReason.USER_NOT_FOUND,
            success: false,
          };
        }

        // Cache the resolved userId back to target
        await this.campaignTargetsService.updateOne(target._id.toString(), {
          recipientUserId,
        });
      }

      if (!recipientUserId) {
        const errorMessage = 'No recipient username or userId';
        await this.campaignTargetsService.markAsFailed(
          target._id.toString(),
          errorMessage,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign._id.toString(),
        );
        return { error: errorMessage, success: false };
      }

      // Generate DM text
      const dmText = await this.generateDmText(
        campaign,
        target.recipientUsername || '',
      );

      // Send DM
      const dmResult = await this.botActionExecutorService.sendDm(
        {
          accessToken: credential.accessToken,
          accessTokenSecret: credential.accessTokenSecret,
          externalId: credential.externalId,
          // @ts-expect-error TS2322
          platform: credential.platform,
          refreshToken: credential.refreshToken,
          username: credential.username,
        },
        recipientUserId,
        dmText,
      );

      if (!dmResult.success) {
        const isDmNotAllowed =
          dmResult.error?.includes('cannot send messages') ||
          dmResult.error?.includes('Direct message');

        if (isDmNotAllowed) {
          await this.campaignTargetsService.markAsSkipped(
            target._id.toString(),
            CampaignSkipReason.DM_NOT_ALLOWED,
          );
          await this.campaignsService.incrementSkippedCounter(
            campaign._id.toString(),
          );
          return {
            error: dmResult.error,
            skipReason: CampaignSkipReason.DM_NOT_ALLOWED,
            success: false,
          };
        }

        await this.campaignTargetsService.markAsFailed(
          target._id.toString(),
          dmResult.error || 'Failed to send DM',
          (target.retryCount || 0) + 1,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign._id.toString(),
        );
        return { error: dmResult.error, success: false };
      }

      // Mark as sent
      await this.campaignTargetsService.updateOne(target._id.toString(), {
        dmSentAt: new Date(),
        dmText,
        processedAt: new Date(),
        status: CampaignTargetStatus.SENT,
      });

      // Update campaign counters
      await this.campaignsService.incrementDmCounter(campaign._id.toString());

      this.loggerService.log(`${url} DM sent`, {
        campaignId: campaign._id,
        recipientUsername: target.recipientUsername,
        targetId: target._id,
      });

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      this.loggerService.error(`${url} failed`, {
        campaignId: campaign._id,
        error,
        targetId: target._id,
      });

      await this.campaignTargetsService.markAsFailed(
        target._id.toString(),
        errorMessage,
        (target.retryCount || 0) + 1,
      );
      await this.campaignsService.incrementFailedCounter(
        campaign._id.toString(),
      );

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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
