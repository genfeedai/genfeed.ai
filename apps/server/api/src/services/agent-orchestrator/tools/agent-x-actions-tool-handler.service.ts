import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { CreateManualReviewBatchDto } from '@api/services/batch-generation/dto/create-manual-review-batch.dto';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { mapTwitterApiError } from '@api/services/integrations/twitter/utils/twitter-api-error.util';
import {
  buildTwitterStatusUrl,
  parseTwitterPostId,
} from '@api/services/integrations/twitter/utils/twitter-post-id.util';
import type { CuratedActionName } from '@genfeedai/actions';
import { CredentialPlatform, Platform } from '@genfeedai/contracts';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * X/Twitter agent tools for search, fetch, activity, and approval-gated
 * quote/repost drafts (#2663).
 */
@Injectable()
export class AgentXActionsToolHandler {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    @Optional() private readonly twitterService: TwitterService | undefined,
    private readonly credentialsService: CredentialsService,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  handles(toolName: CuratedActionName): boolean {
    return (
      toolName === 'search_x_posts' ||
      toolName === 'fetch_x_post' ||
      toolName === 'list_x_account_activity' ||
      toolName === 'draft_x_quote' ||
      toolName === 'draft_x_repost'
    );
  }

  execute(
    toolName: CuratedActionName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'search_x_posts':
        return this.searchXPosts(params);
      case 'fetch_x_post':
        return this.fetchXPost(params, ctx);
      case 'list_x_account_activity':
        return this.listXAccountActivity(params, ctx);
      case 'draft_x_quote':
        return this.draftXEngagement(params, ctx, 'quote');
      case 'draft_x_repost':
        return this.draftXEngagement(params, ctx, 'repost');
      default:
        throw new Error(`Unsupported X action tool: ${toolName}`);
    }
  }

  async searchXPosts(
    params: Record<string, unknown>,
  ): Promise<AgentToolResult> {
    const query = readOptionalString(params.query);
    if (!query) {
      return {
        creditsUsed: 0,
        error: 'query is required',
        success: false,
      };
    }

    const limit = Math.min(
      Math.max(readOptionalNumber(params.limit) ?? 10, 1),
      25,
    );
    const sortOrder = params.sortOrder === 'recency' ? 'recency' : 'relevancy';
    const twitterService = this.resolveTwitterService();
    if (!twitterService) {
      return this.unavailableResult();
    }

    try {
      const tweets = await twitterService.searchRecentTweets(query, {
        maxResults: limit,
        sortOrder,
      });

      return {
        creditsUsed: 1,
        data: {
          count: tweets.length,
          posts: tweets.map((tweet) => ({
            author: tweet.authorUsername,
            authorName: tweet.authorName,
            content: tweet.text,
            createdAt: tweet.createdAt,
            engagement: tweet.engagement,
            id: tweet.id,
            likes: tweet.likes,
            replies: tweet.replies,
            retweets: tweet.retweets,
            url: buildTwitterStatusUrl(tweet.id, tweet.authorUsername),
          })),
          query,
          sortOrder,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName} searchXPosts failed`, {
        error: mapTwitterApiError(error),
        query,
      });
      return {
        creditsUsed: 0,
        error: mapTwitterApiError(error),
        success: false,
      };
    }
  }

  async fetchXPost(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const raw = readOptionalString(params.postIdOrUrl);
    if (!raw) {
      return {
        creditsUsed: 0,
        error: 'postIdOrUrl is required',
        success: false,
      };
    }

    const postId = parseTwitterPostId(raw);
    if (!postId) {
      return {
        creditsUsed: 0,
        error: 'That does not look like an X post link or id.',
        success: false,
      };
    }
    const twitterService = this.resolveTwitterService();
    if (!twitterService) {
      return this.unavailableResult();
    }

    try {
      const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
      const tweet = await twitterService.getTweetById(postId, {
        brandId,
        credentialId: readOptionalString(params.credentialId),
        organizationId: ctx.organizationId,
      });

      return {
        creditsUsed: 1,
        data: {
          author: tweet.authorUsername,
          authorId: tweet.authorId,
          content: tweet.text,
          createdAt: tweet.createdAt,
          id: tweet.id,
          likes: tweet.likeCount,
          replies: tweet.replyCount,
          retweets: tweet.retweetCount,
          url: tweet.url,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${this.constructorName} fetchXPost failed`, {
        error: mapTwitterApiError(error),
        postId,
      });
      return {
        creditsUsed: 0,
        error: mapTwitterApiError(error),
        success: false,
      };
    }
  }

  async listXAccountActivity(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
    // A brand may hold several X accounts; an explicit id reads as that one,
    // otherwise the resolver picks the brand default and logs the rest.
    const credentialId = readOptionalString(params.credentialId);
    let username = readOptionalString(params.username)?.replace(/^@/, '');
    let accessToken: string | undefined;
    const twitterService = this.resolveTwitterService();
    if (!twitterService) {
      return this.unavailableResult();
    }

    if (!username) {
      if (!brandId) {
        return {
          creditsUsed: 0,
          error: 'Add a username, or connect X for this brand first.',
          success: false,
        };
      }

      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        organizationId: ctx.organizationId,
        platform: CredentialPlatform.TWITTER,
      });

      username = readOptionalString(credential?.username)?.replace(/^@/, '');
      if (!username) {
        return {
          creditsUsed: 0,
          error: 'Connect X for this brand, or enter a username.',
          success: false,
        };
      }

      accessToken =
        (await twitterService.resolveBrandUserAccessToken(
          ctx.organizationId,
          brandId,
          credentialId,
        )) ?? undefined;
    } else if (brandId) {
      accessToken =
        (await twitterService.resolveBrandUserAccessToken(
          ctx.organizationId,
          brandId,
          credentialId,
        )) ?? undefined;
    }

    const limit = Math.min(
      Math.max(readOptionalNumber(params.limit) ?? 20, 5),
      50,
    );

    try {
      const posts = await twitterService.getUserTimelineByUsername(username, {
        accessToken,
        excludeReplies: params.excludeReplies === true,
        excludeRetweets: params.excludeRetweets === true,
        maxResults: limit,
      });

      return {
        creditsUsed: 1,
        data: {
          count: posts.length,
          posts: posts.map((post) => ({
            author: post.authorUsername ?? username,
            authorName: post.authorName,
            content: post.text,
            createdAt: post.createdAt?.toISOString?.() ?? post.createdAt,
            id: post.id,
            isRetweet: post.isRetweet,
            likes: post.metrics?.likes,
            replies: post.metrics?.comments,
            retweets: post.metrics?.shares,
            url: buildTwitterStatusUrl(
              post.id,
              post.authorUsername ?? username,
            ),
          })),
          username,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} listXAccountActivity failed`,
        { error: mapTwitterApiError(error), username },
      );
      return {
        creditsUsed: 0,
        error: mapTwitterApiError(error),
        success: false,
      };
    }
  }

  private resolveTwitterService(): TwitterService | undefined {
    if (this.twitterService) {
      return this.twitterService;
    }
    try {
      return this.moduleRef?.get(TwitterService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private unavailableResult(): AgentToolResult {
    return {
      creditsUsed: 0,
      error: 'X integration is unavailable right now.',
      success: false,
    };
  }

  private async draftXEngagement(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    action: 'quote' | 'repost',
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const rawTarget = readOptionalString(params.targetPostIdOrUrl);
    if (!rawTarget) {
      return {
        creditsUsed: 0,
        error: 'targetPostIdOrUrl is required',
        success: false,
      };
    }

    const targetPostId = parseTwitterPostId(rawTarget);
    if (!targetPostId) {
      return {
        creditsUsed: 0,
        error: 'That does not look like an X post link or id.',
        success: false,
      };
    }

    const quoteContent = readOptionalString(params.quoteContent);
    if (action === 'quote' && !quoteContent) {
      return {
        creditsUsed: 0,
        error: 'Add text for the quote.',
        success: false,
      };
    }

    const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'Brand is required for repost and quote.',
        success: false,
      };
    }
    const caption =
      action === 'quote' ? (quoteContent as string) : `Repost ${targetPostId}`;
    const targetAuthor = readOptionalString(params.targetAuthor);
    const targetPostContent = readOptionalString(params.targetPostContent);
    const targetPostUrl = buildTwitterStatusUrl(targetPostId, targetAuthor);

    const dto: CreateManualReviewBatchDto = {
      brandId,
      items: [
        {
          caption,
          engagementAction: action,
          format: 'post',
          platform: Platform.TWITTER,
          targetAuthor,
          targetPostContent,
          targetPostId,
          targetPostUrl,
          type: 'engagement',
        },
      ],
    };

    try {
      const batch = await this.batchGenerationService.createManualReviewBatch(
        dto,
        ctx.userId,
        ctx.organizationId,
      );

      return {
        creditsUsed: 1,
        data: {
          action,
          batchId: batch.id,
          message:
            action === 'quote'
              ? 'Quote draft is ready for review. Nothing posts until you approve it.'
              : 'Repost draft is ready for review. Nothing posts until you approve it.',
          targetPostId,
          targetPostUrl,
        },
        requiresConfirmation: true,
        riskLevel: 'medium',
        success: true,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(
        `${this.constructorName} draftXEngagement failed`,
        { action, error: message, targetPostId },
      );
      return {
        creditsUsed: 0,
        error: message,
        success: false,
      };
    }
  }
}
