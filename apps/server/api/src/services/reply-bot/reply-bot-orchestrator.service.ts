/**
 * Reply Bot Orchestrator Service
 *
 * Coordinates the multi-platform reply bot workflow:
 * - Fetches content from social platforms via SocialMonitorService
 * - Generates AI-powered replies
 * - Executes actions (post replies, send DMs)
 * - Tracks activities and rate limits
 *
 * Supported platforms: Twitter/X, Instagram, TikTok, YouTube, Reddit
 */
import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { ConfigService } from '@api/config/config.service';
import { BotActionExecutorService } from '@api/services/reply-bot/bot-action-executor.service';
import { RateLimitService } from '@api/services/reply-bot/rate-limit.service';
import { ReplyGenerationService } from '@api/services/reply-bot/reply-generation.service';
import {
  type SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import {
  BotActivitySkipReason,
  BotActivityStatus,
  ReplyBotActionType,
  ReplyBotPlatform,
  ReplyBotType,
  ReplyLength,
  ReplyTone,
} from '@genfeedai/enums';
import type { IReplyBotCredentialData } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Result of processing bots for an organization
 */
export interface ProcessingResult {
  botConfigId: string;
  platform: ReplyBotPlatform;
  contentProcessed: number;
  repliesSent: number;
  dmsSent: number;
  skipped: number;
  errors: number;
}

@Injectable()
export class ReplyBotOrchestratorService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    readonly _configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly socialMonitorService: SocialMonitorService,
    private readonly replyGenerationService: ReplyGenerationService,
    private readonly botActionExecutorService: BotActionExecutorService,
    private readonly rateLimitService: RateLimitService,
    private readonly replyBotConfigsService: ReplyBotConfigsService,
    private readonly monitoredAccountsService: MonitoredAccountsService,
    private readonly botActivitiesService: BotActivitiesService,
    private readonly processedTweetsService: ProcessedTweetsService,
  ) {}

  /**
   * Main entry point - process all active bots for an organization
   */
  async processOrganizationBots(
    organizationId: string,
    credential: IReplyBotCredentialData,
  ): Promise<ProcessingResult[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const results: ProcessingResult[] = [];

    try {
      // Get all active bot configs for this organization
      const activeBots = await this.replyBotConfigsService.findActive(
        organizationId.toString(),
      );

      this.loggerService.log(`${url} starting`, {
        activeBotCount: activeBots.length,
        organizationId: organizationId.toString(),
      });

      for (const botConfig of activeBots) {
        const result = await this.processSingleBot(
          botConfig,
          organizationId.toString(),
          credential,
        );
        results.push(result);
      }

      this.loggerService.log(`${url} completed`, {
        organizationId: organizationId.toString(),
        totalBots: results.length,
        totalDms: results.reduce((sum, r) => sum + r.dmsSent, 0),
        totalReplies: results.reduce((sum, r) => sum + r.repliesSent, 0),
      });

      return results;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Process a single bot configuration
   */
  async processSingleBot(
    botConfig: ReplyBotConfigDocument,
    organizationId: string,
    credential: IReplyBotCredentialData,
  ): Promise<ProcessingResult> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const botConfigId = botConfig._id.toString();
    const platform = credential.platform || ReplyBotPlatform.TWITTER;

    const result: ProcessingResult = {
      botConfigId,
      contentProcessed: 0,
      dmsSent: 0,
      errors: 0,
      platform,
      repliesSent: 0,
      skipped: 0,
    };

    try {
      // Check if within schedule
      if (!this.rateLimitService.isWithinSchedule(botConfig)) {
        this.loggerService.log(`${url} outside schedule`, { botConfigId });
        return result;
      }

      // Fetch content based on bot type
      let content: SocialContentData[] = [];

      if (botConfig.type === ReplyBotType.REPLY_GUY) {
        content = await this.fetchMentions(
          botConfig,
          credential,
          organizationId,
          platform,
        );
      } else if (botConfig.type === ReplyBotType.ACCOUNT_MONITOR) {
        content = await this.fetchMonitoredAccountContent(
          botConfig,
          credential,
          organizationId,
          platform,
        );
      } else if (botConfig.type === ReplyBotType.COMMENT_RESPONDER) {
        content = await this.fetchComments(
          botConfig,
          credential,
          organizationId,
          platform,
        );
      }

      this.loggerService.log(`${url} fetched content`, {
        botConfigId,
        botType: botConfig.type,
        contentCount: content.length,
        platform,
      });

      // Process each content item
      for (const item of content) {
        const processed = await this.processContent(
          botConfig,
          item,
          organizationId,
          credential,
        );

        result.contentProcessed++;

        if (processed.skipped) {
          result.skipped++;
        } else if (processed.error) {
          result.errors++;
        } else {
          if (processed.replySent) {
            result.repliesSent++;
          }
          if (processed.dmSent) {
            result.dmsSent++;
          }
        }
      }

      this.loggerService.log(`${url} completed bot processing`, result);

      return result;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, { botConfigId, error });
      return result;
    }
  }

  /**
   * Fetch mentions for REPLY_GUY bot type
   */
  private async fetchMentions(
    botConfig: ReplyBotConfigDocument,
    credential: IReplyBotCredentialData,
    organizationId: string,
    platform: ReplyBotPlatform,
  ): Promise<SocialContentData[]> {
    const username = credential.username;
    if (!username) {
      this.loggerService.warn(
        `No username in credential for ${platform}, skipping mentions fetch`,
      );
      return [];
    }

    const mentions = await this.socialMonitorService.getUserMentions(
      platform,
      username,
      { limit: 100, sinceId: botConfig.lastProcessedTweetId },
    );

    // Filter out already processed content
    const unprocessed =
      await this.socialMonitorService.filterUnprocessedContent(
        mentions,
        organizationId,
        ReplyBotType.REPLY_GUY,
      );

    return unprocessed;
  }

  /**
   * Fetch content from monitored accounts for ACCOUNT_MONITOR bot type
   */
  private async fetchMonitoredAccountContent(
    botConfig: ReplyBotConfigDocument,
    _credential: IReplyBotCredentialData,
    organizationId: string,
    platform: ReplyBotPlatform,
  ): Promise<SocialContentData[]> {
    const allContent: SocialContentData[] = [];

    // Get all active monitored accounts for this bot
    const monitoredAccounts =
      await this.monitoredAccountsService.findByBotConfig(
        botConfig._id.toString(),
        organizationId,
      );

    for (const account of monitoredAccounts) {
      if (!account.isActive || !account.twitterUsername) {
        continue;
      }

      const content = await this.socialMonitorService.getUserTimeline(
        platform,
        account.twitterUsername,
        { limit: 10, sinceId: account.lastProcessedTweetId },
      );

      // Apply account-specific filters
      const filtered = this.socialMonitorService.filterContent(
        content,
        account.filters,
      );

      // Filter out already processed content
      const unprocessed =
        await this.socialMonitorService.filterUnprocessedContent(
          filtered,
          organizationId,
          ReplyBotType.ACCOUNT_MONITOR,
        );

      // Update last processed ID
      if (unprocessed.length > 0) {
        const latestId = unprocessed[0].id;
        await this.monitoredAccountsService.updateLastProcessed(
          account._id.toString(),
          organizationId,
          latestId,
        );
      }

      allContent.push(...unprocessed);
    }

    return allContent;
  }

  /**
   * Fetch comments on user's content for COMMENT_RESPONDER bot type
   *
   * Fetches user's recent posts, then retrieves comments on each post,
   * filtering out already-processed comments.
   */
  private async fetchComments(
    botConfig: ReplyBotConfigDocument,
    credential: IReplyBotCredentialData,
    organizationId: string,
    platform: ReplyBotPlatform,
  ): Promise<SocialContentData[]> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const allComments: SocialContentData[] = [];

    const username = credential.username;
    if (!username) {
      this.loggerService.warn(
        `${url} No username in credential for ${platform}, skipping comments fetch`,
      );
      return [];
    }

    try {
      const userPosts = await this.socialMonitorService.getUserTimeline(
        platform,
        username,
        { limit: 10 },
      );

      this.loggerService.log(`${url} fetched user posts for comment scan`, {
        platform,
        postCount: userPosts.length,
        username,
      });

      for (const post of userPosts) {
        const comments = await this.socialMonitorService.getContentComments(
          platform,
          post.id,
          { limit: 50 },
        );

        allComments.push(...comments);
      }

      const unprocessed =
        await this.socialMonitorService.filterUnprocessedContent(
          allComments,
          organizationId,
          ReplyBotType.COMMENT_RESPONDER,
        );

      // Apply keyword filters from bot config
      let filtered = unprocessed;
      if (botConfig.filters?.includeKeywords?.length) {
        filtered = filtered.filter((item) =>
          botConfig.filters?.includeKeywords?.some((keyword) =>
            item.text.toLowerCase().includes(keyword.toLowerCase()),
          ),
        );
      }
      if (botConfig.filters?.excludeKeywords?.length) {
        filtered = filtered.filter(
          (item) =>
            !botConfig.filters?.excludeKeywords?.some((keyword) =>
              item.text.toLowerCase().includes(keyword.toLowerCase()),
            ),
        );
      }

      this.loggerService.log(`${url} comment fetch complete`, {
        filteredComments: filtered.length,
        platform,
        totalComments: allComments.length,
        unprocessedComments: unprocessed.length,
      });

      return filtered;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed to fetch comments`, {
        error: (error as Error)?.message,
        platform,
        username,
      });
      return [];
    }
  }

  /**
   * Process a single content item - generate and send reply, optionally DM
   */
  private async processContent(
    botConfig: ReplyBotConfigDocument,
    content: SocialContentData,
    organizationId: string,
    credential: IReplyBotCredentialData,
  ): Promise<{
    skipped: boolean;
    skipReason?: BotActivitySkipReason;
    error?: boolean;
    replySent?: boolean;
    dmSent?: boolean;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const botConfigId = botConfig._id.toString();

    // Check rate limits
    const rateCheck = await this.rateLimitService.checkRateLimit(
      botConfigId,
      organizationId,
    );

    if (!rateCheck.allowed) {
      // Log skipped activity
      await this.botActivitiesService.create({
        // @ts-expect-error TS2353
        botConfig: botConfig._id,
        botType: botConfig.type,
        organization: organizationId,
        skipReason: BotActivitySkipReason.RATE_LIMITED,
        status: BotActivityStatus.SKIPPED,
        triggerTweetAuthorId: content.authorId,
        triggerTweetAuthorUsername: content.authorUsername,
        triggerTweetId: content.id,
        triggerTweetText: content.text,
      });

      return {
        skipped: true,
        skipReason: BotActivitySkipReason.RATE_LIMITED,
      };
    }

    // Create activity record in processing state
    const activity = await this.botActivitiesService.create({
      // @ts-expect-error TS2353
      botConfig: botConfig._id,
      botType: botConfig.type,
      organization: organizationId,
      status: BotActivityStatus.PROCESSING,
      triggerTweetAuthorId: content.authorId,
      triggerTweetAuthorUsername: content.authorUsername,
      triggerTweetId: content.id,
      triggerTweetText: content.text,
    });

    const activityId = activity._id.toString();

    try {
      // Generate AI reply
      const replyText = await this.replyGenerationService.generateReply({
        context: botConfig.context,
        customInstructions: botConfig.customInstructions,
        length: (botConfig.replyLength as ReplyLength) || ReplyLength.MEDIUM,
        organizationId,
        tone: (botConfig.replyTone as ReplyTone) || ReplyTone.FRIENDLY,
        tweetAuthor: content.authorUsername,
        tweetContent: content.text,
        userId: botConfig.user?.toString() || '',
      });

      // Generate DM if configured
      let dmText: string | undefined;
      if (
        botConfig.actionType === ReplyBotActionType.REPLY_AND_DM ||
        botConfig.actionType === ReplyBotActionType.DM_ONLY
      ) {
        const dmInstructions = [
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

        dmText = await this.replyGenerationService.generateDm({
          context: botConfig.dmConfig?.context,
          customInstructions: dmInstructions || undefined,
          organizationId,
          replyText,
          tweetAuthor: content.authorUsername,
          tweetContent: content.text,
          userId: botConfig.user?.toString() || '',
        });
      }

      // Execute actions
      let replySent = false;
      let dmSent = false;
      let replyContentId: string | undefined;
      let replyContentUrl: string | undefined;

      // Ensure credential has platform info for routing
      const platformCredential = {
        ...credential,
        platform:
          credential.platform ||
          (botConfig as unknown as { platform?: string }).platform ||
          ReplyBotPlatform.TWITTER,
      };

      // Post reply (unless DM only)
      if (botConfig.actionType !== ReplyBotActionType.DM_ONLY) {
        const contentData = {
          authorId: content.authorId,
          authorUsername: content.authorUsername,
          createdAt: content.createdAt,
          id: content.id,
          text: content.text,
        };

        const replyResult = await this.botActionExecutorService.postReply(
          // @ts-expect-error TS2345
          platformCredential,
          contentData,
          replyText,
        );

        if (replyResult.success) {
          replySent = true;
          replyContentId = replyResult.contentId;
          replyContentUrl = replyResult.contentUrl;
        } else {
          throw new Error(replyResult.error || 'Failed to post reply');
        }
      }

      // Send DM if configured
      if (
        dmText &&
        (botConfig.actionType === ReplyBotActionType.REPLY_AND_DM ||
          botConfig.actionType === ReplyBotActionType.DM_ONLY)
      ) {
        // delaySeconds from IReplyBotDmConfig, convert to ms
        const dmDelay = botConfig.dmConfig?.delaySeconds
          ? botConfig.dmConfig.delaySeconds * 1000
          : 60000;

        await this.delay(dmDelay);

        const dmResult = await this.botActionExecutorService.sendDm(
          // @ts-expect-error TS2345
          platformCredential,
          content.authorId,
          dmText,
        );

        dmSent = dmResult.success;
      }

      // Update activity to completed
      await this.botActivitiesService.updateStatus(activityId, organizationId, {
        completedAt: new Date(),
        dmSent,
        dmText,
        replyText,
        replyTweetId: replyContentId,
        replyTweetUrl: replyContentUrl,
        status: BotActivityStatus.COMPLETED,
      });

      // Mark content as processed
      await this.processedTweetsService.markAsProcessed(
        content.id,
        organizationId,
        (botConfig.type ?? ReplyBotType.REPLY_GUY) as ReplyBotType,
        botConfigId,
      );

      // Increment rate limit counter
      this.rateLimitService.incrementCounter(botConfigId);

      this.loggerService.log(`${url} content processed successfully`, {
        botConfigId,
        contentId: content.id,
        dmSent,
        platform: content.platform,
        replySent,
      });

      return {
        dmSent,
        replySent,
        skipped: false,
      };
    } catch (error: unknown) {
      const errorMessage = (error as Error)?.message || 'Unknown error';

      // Update activity to failed
      await this.botActivitiesService.updateStatus(activityId, organizationId, {
        errorMessage,
        status: BotActivityStatus.FAILED,
      });

      this.loggerService.error(`${url} content processing failed`, {
        botConfigId,
        contentId: content.id,
        error: errorMessage,
      });

      return {
        error: true,
        skipped: false,
      };
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Test mode - generate reply without posting
   */
  async testReplyGeneration(
    botConfigId: string,
    organizationId: string,
    testContent: { content: string; author: string },
  ): Promise<{ replyText: string; dmText?: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const botConfig = await this.replyBotConfigsService.findOneById(
      botConfigId,
      organizationId,
    );

    if (!botConfig) {
      throw new Error('Bot configuration not found');
    }

    const replyText = await this.replyGenerationService.generateReply({
      context: botConfig.context,
      customInstructions: botConfig.customInstructions,
      length: (botConfig.replyLength as ReplyLength) || ReplyLength.MEDIUM,
      organizationId,
      tone: (botConfig.replyTone as ReplyTone) || ReplyTone.FRIENDLY,
      tweetAuthor: testContent.author,
      tweetContent: testContent.content,
      userId: botConfig.user?.toString() || '',
    });

    let dmText: string | undefined;
    if (
      botConfig.actionType === ReplyBotActionType.REPLY_AND_DM ||
      botConfig.actionType === ReplyBotActionType.DM_ONLY
    ) {
      const dmInstructions = [
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

      dmText = await this.replyGenerationService.generateDm({
        context: botConfig.dmConfig?.context,
        customInstructions: dmInstructions || undefined,
        organizationId,
        replyText,
        tweetAuthor: testContent.author,
        tweetContent: testContent.content,
        userId: botConfig.user?.toString() || '',
      });
    }

    this.loggerService.log(`${url} test generation completed`, {
      botConfigId,
      dmGenerated: !!dmText,
      replyLength: replyText.length,
    });

    return { dmText, replyText };
  }
}
