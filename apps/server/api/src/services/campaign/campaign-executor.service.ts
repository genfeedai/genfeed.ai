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
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@server/collections/workflows/system-workflow-provenance.service';
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
import { scopedWhere } from '@genfeedai/server';
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
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
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

      // Check if campaign is still active
      if (campaign.status !== CampaignStatus.ACTIVE) {
        if (campaign.organizationId) {
          await this.campaignTargetsService.markAsSkipped(
            target.id.toString(),
            campaign.organizationId,
            CampaignSkipReason.CAMPAIGN_PAUSED,
          );
          await this.campaignsService.incrementSkippedCounter(
            campaign.id.toString(),
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
        campaign.id.toString(),
        scope.organizationId,
      );
      if (!canReply) {
        await this.campaignTargetsService.markAsSkipped(
          target.id.toString(),
          scope.organizationId,
          CampaignSkipReason.RATE_LIMITED,
        );
        await this.campaignsService.incrementSkippedCounter(
          campaign.id.toString(),
          scope.organizationId,
        );

        return {
          skipReason: CampaignSkipReason.RATE_LIMITED,
          success: false,
        };
      }

      const claimed = await this.campaignTargetsService.claimForProcessing(
        target.id.toString(),
        scope.organizationId,
        {
          scheduleVersion: readCampaignScheduleVersion(campaign.schedule),
        },
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
          target.id.toString(),
          scope.organizationId,
          errorMessage,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign.id.toString(),
          scope.organizationId,
        );

        return {
          error: errorMessage,
          success: false,
        };
      }

      // Generate reply
      const replyText = await this.generateReply(campaign, target, scope);

      // Post reply
      const credentialData = toReplyBotCredentialData(
        credential as Record<string, unknown>,
      );

      if (!credentialData) {
        const errorMessage = 'Credential is missing an access token';
        await this.campaignTargetsService.markAsFailed(
          target.id.toString(),
          scope.organizationId,
          errorMessage,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign.id.toString(),
          scope.organizationId,
        );

        return {
          error: errorMessage,
          success: false,
        };
      }

      const reservation = await this.campaignsService.reserveReplySlot(
        campaign.id.toString(),
        scope.organizationId,
      );
      if (!reservation.reserved) {
        await this.campaignTargetsService.markAsSkipped(
          target.id.toString(),
          scope.organizationId,
          CampaignSkipReason.RATE_LIMITED,
          CampaignTargetStatus.PROCESSING,
        );
        await this.campaignsService.incrementSkippedCounter(
          campaign.id.toString(),
          scope.organizationId,
        );

        this.loggerService.log(`${url} reservation denied`, {
          campaignId: campaign.id,
          targetId: target.id,
        });

        return {
          skipReason: CampaignSkipReason.RATE_LIMITED,
          success: false,
        };
      }

      const { result: postResult } =
        await this.systemWorkflowProvenanceService.runAction(
          {
            actionType: 'campaign-reply',
            canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.CAMPAIGN_REPLY_AUTOMATION,
            description:
              'Generates and posts outreach campaign replies through connected brand credentials.',
            failureMessage: (replyResult) =>
              replyResult.success
                ? undefined
                : replyResult.error || 'Campaign reply failed',
            inputValues: {
              campaignId: campaign.id.toString(),
              platform: campaign.platform,
              targetId: target.id.toString(),
            },
            label: 'Campaign Reply Automation',
            organizationId: scope.organizationId,
            source: 'CampaignExecutorService.executeTarget',
            trigger: WorkflowExecutionTrigger.SCHEDULED,
            userId: scope.userId,
          },
          () =>
            Promise.resolve(
              this.postReply(
                campaign.platform,
                credentialData,
                target,
                replyText,
              ),
            ),
        );

      if (!postResult.success) {
        await this.campaignTargetsService.markAsFailed(
          target.id.toString(),
          scope.organizationId,
          postResult.error || 'Failed to post reply',
          (target.retryCount || 0) + 1,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign.id.toString(),
          scope.organizationId,
        );

        return {
          error: postResult.error,
          success: false,
        };
      }

      await this.campaignTargetsService.markAsReplied(
        target.id.toString(),
        scope.organizationId,
        {
          replyExternalId: postResult.tweetId || '',
          replyText,
          replyUrl: postResult.tweetUrl || '',
        },
      );

      await this.campaignsService.incrementReplyCounters(
        campaign.id.toString(),
        scope.organizationId,
      );

      this.loggerService.log(`${url} success`, {
        campaignId: campaign.id,
        replyId: postResult.tweetId,
        targetId: target.id,
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
        campaignId: campaign.id,
        error,
        targetId: target.id,
      });

      if (campaign.organizationId) {
        await this.campaignTargetsService.markAsFailed(
          target.id.toString(),
          campaign.organizationId,
          errorMessage,
          (target.retryCount || 0) + 1,
        );
        await this.campaignsService.incrementFailedCounter(
          campaign.id.toString(),
          campaign.organizationId,
        );
      }

      return {
        error: errorMessage,
        success: false,
      };
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
          .then((replyResult) => ({
            error: replyResult.error,
            success: replyResult.success,
            tweetId:
              replyResult.contentId ??
              (replyResult as unknown as { tweetId?: string }).tweetId,
            tweetUrl:
              replyResult.contentUrl ??
              (replyResult as unknown as { tweetUrl?: string }).tweetUrl,
          }));

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
    requireExecutableOutreachPair({
      campaignType: campaign.campaignType,
      platform: campaign.platform,
    });
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
          campaignId: campaign.id,
          campaignType: campaign.campaignType,
          platform: campaign.platform,
        });
        return results;
      }

      if (!campaign.organizationId) {
        this.loggerService.error(`${url} failed`, {
          campaignId: campaign.id,
          reason: 'organization_id_required',
        });
        return results;
      }

      const pendingTargets =
        await this.campaignTargetsService.getPendingTargets(
          campaign.id.toString(),
          campaign.organizationId,
          limit,
          {
            scheduleVersion: readCampaignScheduleVersion(campaign.schedule),
          },
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
}
