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
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import {
  type ReplyGenerationOptions,
  ReplyGenerationService,
} from '@api/services/reply-bot/reply-generation.service';
import {
  CampaignPlatform,
  CampaignSkipReason,
  CampaignStatus,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

export interface ExecutionResult {
  success: boolean;
  replyText?: string;
  replyExternalId?: string;
  replyUrl?: string;
  error?: string;
  skipReason?: CampaignSkipReason;
}

@Injectable()
export class CampaignExecutorService {
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
   * Execute a single target
   */
  async executeTarget(
    campaign: OutreachCampaignDocument,
    target: CampaignTargetDocument,
  ): Promise<ExecutionResult> {
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

        return {
          skipReason: CampaignSkipReason.RATE_LIMITED,
          success: false,
        };
      }

      // Mark target as processing
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

        return {
          error: errorMessage,
          success: false,
        };
      }

      // Generate reply
      const replyText = await this.generateReply(campaign, target);

      // Post reply
      const postResult = await this.postReply(
        campaign.platform,
        {
          accessToken: credential.accessToken,
          accessTokenSecret: credential.accessTokenSecret,
          externalId: credential.externalId,
          refreshToken: credential.refreshToken,
          username: credential.username,
        },
        target,
        replyText,
      );

      if (!postResult.success) {
        await this.campaignTargetsService.markAsFailed(
          target._id.toString(),
          postResult.error || 'Failed to post reply',
          (target.retryCount || 0) + 1,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign._id.toString(),
        );

        return {
          error: postResult.error,
          success: false,
        };
      }

      // Mark as replied
      await this.campaignTargetsService.markAsReplied(target._id.toString(), {
        replyExternalId: postResult.tweetId || '',
        replyText,
        replyUrl: postResult.tweetUrl || '',
      });

      // Update campaign counters
      await this.campaignsService.incrementReplyCounters(
        campaign._id.toString(),
      );

      this.loggerService.log(`${url} success`, {
        campaignId: campaign._id,
        replyId: postResult.tweetId,
        targetId: target._id,
      });

      return {
        replyExternalId: postResult.tweetId,
        replyText,
        replyUrl: postResult.tweetUrl,
        success: true,
      };
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

      return {
        error: errorMessage,
        success: false,
      };
    }
  }

  /**
   * Generate a reply for a target
   */
  private generateReply(
    campaign: OutreachCampaignDocument,
    target: CampaignTargetDocument,
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
      length: aiConfig.length || ReplyLength.MEDIUM,
      organizationId: campaign.organization.toString(),
      tone: aiConfig.tone || ReplyTone.FRIENDLY,
      tweetAuthor: target.authorUsername || 'unknown',
      tweetContent: target.contentText || '',
      userId: campaign.user?.toString() || '',
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
      .replace(/\{\{author\}\}/g, target.authorUsername || '')
      .replace(/\{\{content\}\}/g, target.contentText || '')
      .replace(/\{\{keyword\}\}/g, target.matchedKeyword || '');
  }

  /**
   * Post a reply to the target platform
   */
  private postReply(
    platform: CampaignPlatform,
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
    switch (platform) {
      case CampaignPlatform.TWITTER:
        return this.botActionExecutorService.postReply(
          credential,
          {
            authorId: target.authorId || '',
            authorUsername: target.authorUsername || '',
            createdAt: target.contentCreatedAt || new Date(),
            id: target.externalId,
            text: target.contentText || '',
          },
          replyText,
        );

      case CampaignPlatform.REDDIT:
        // Reddit reply would be implemented similarly
        // For now, return error as Reddit requires different API
        return {
          error: 'Reddit replies not yet implemented',
          success: false,
        };

      default:
        return {
          error: `Unsupported platform: ${platform}`,
          success: false,
        };
    }
  }

  /**
   * Preview a reply without posting
   */
  previewReply(
    campaign: OutreachCampaignDocument,
    target: CampaignTargetDocument,
  ): Promise<string> | string {
    return this.generateReply(campaign, target);
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
        const result = await this.executeTarget(campaign, target);
        results.processed++;

        if (result.success) {
          results.successful++;
        } else if (result.skipReason) {
          results.skipped++;
        } else {
          results.failed++;
        }

        // Add delay between replies
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
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
