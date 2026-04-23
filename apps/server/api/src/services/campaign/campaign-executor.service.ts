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
      const credentialData = this.toReplyBotCredentialData(
        credential as Record<string, unknown>,
      );

      if (!credentialData) {
        const errorMessage = 'Credential is missing an access token';
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

      const postResult = await this.postReply(
        campaign.platform,
        credentialData,
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
      length: this.normalizeReplyLength(aiConfig.length),
      organizationId: campaign.organization.toString(),
      tone: this.normalizeReplyTone(aiConfig.tone),
      tweetAuthor: this.asString(target.authorUsername) ?? 'unknown',
      tweetContent: this.asString(target.contentText) ?? '',
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
        return this.botActionExecutorService.postReply(
          credential,
          {
            authorId: this.asString(target.authorId) ?? '',
            authorUsername: this.asString(target.authorUsername) ?? '',
            createdAt: this.asDate(target.contentCreatedAt),
            id: this.asString(target.externalId) ?? '',
            text: this.asString(target.contentText) ?? '',
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
          error: `Unsupported platform: ${platform ?? 'unknown'}`,
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
}
