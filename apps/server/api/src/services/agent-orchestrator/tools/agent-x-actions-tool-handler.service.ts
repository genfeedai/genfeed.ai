import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@api/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import {
  buildTwitterStatusUrl,
  parseTwitterPostId,
} from '@api/services/integrations/twitter/utils/twitter-post-id.util';
import { CredentialPlatform } from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

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

function mapTwitterApiError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const lower = message.toLowerCase();

  if (
    lower.includes('403') ||
    lower.includes('not authorized') ||
    lower.includes('client-not-enrolled') ||
    lower.includes('oauth1apppermissions') ||
    lower.includes('access level') ||
    lower.includes('elevated')
  ) {
    return (
      'X account tier does not allow this read/write action. ' +
      'Connect an account with the required API access, or upgrade the X developer tier.'
    );
  }

  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests')
  ) {
    return 'X rate limit reached. Wait for the limit window to reset before retrying.';
  }

  if (
    lower.includes('credential') ||
    lower.includes('token') ||
    lower.includes('unauthorized') ||
    lower.includes('401')
  ) {
    return 'X credential missing or expired. Reconnect the brand X account and try again.';
  }

  return message;
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
    private readonly twitterService: TwitterService,
    private readonly credentialsService: CredentialsService,
    private readonly internalApi: AgentToolInternalApiService,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
  ) {}

  handles(toolName: AgentToolName): boolean {
    return (
      toolName === AgentToolName.SEARCH_X_POSTS ||
      toolName === AgentToolName.FETCH_X_POST ||
      toolName === AgentToolName.LIST_X_ACCOUNT_ACTIVITY ||
      toolName === AgentToolName.DRAFT_X_QUOTE ||
      toolName === AgentToolName.DRAFT_X_REPOST
    );
  }

  execute(
    toolName: AgentToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case AgentToolName.SEARCH_X_POSTS:
        return this.searchXPosts(params);
      case AgentToolName.FETCH_X_POST:
        return this.fetchXPost(params, ctx);
      case AgentToolName.LIST_X_ACCOUNT_ACTIVITY:
        return this.listXAccountActivity(params, ctx);
      case AgentToolName.DRAFT_X_QUOTE:
        return this.draftXEngagement(params, ctx, 'quote');
      case AgentToolName.DRAFT_X_REPOST:
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

    try {
      const tweets = await this.twitterService.searchRecentTweets(query, {
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
        error:
          'Could not resolve an X post id from the provided URL or id. Use a status link or bare numeric id.',
        success: false,
      };
    }

    try {
      const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
      const tweet = await this.twitterService.getTweetById(postId, {
        brandId,
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
    let username = readOptionalString(params.username)?.replace(/^@/, '');
    let accessToken: string | undefined;

    if (!username) {
      if (!brandId) {
        return {
          creditsUsed: 0,
          error:
            'username or a brand with a connected X account is required for list_x_account_activity',
          success: false,
        };
      }

      const credential = await this.credentialsService.findOne({
        brandId,
        isDeleted: false,
        organizationId: ctx.organizationId,
        platform: CredentialPlatform.TWITTER,
      });

      username = readOptionalString(credential?.username)?.replace(/^@/, '');
      if (!username) {
        return {
          creditsUsed: 0,
          error:
            'No connected X username found for this brand. Connect X or pass username.',
          success: false,
        };
      }

      accessToken =
        (await this.twitterService.resolveBrandUserAccessToken(
          ctx.organizationId,
          brandId,
        )) ?? undefined;
    } else if (brandId) {
      accessToken =
        (await this.twitterService.resolveBrandUserAccessToken(
          ctx.organizationId,
          brandId,
        )) ?? undefined;
    }

    const limit = Math.min(
      Math.max(readOptionalNumber(params.limit) ?? 20, 5),
      50,
    );

    try {
      const posts = await this.twitterService.getUserTimelineByUsername(
        username,
        {
          accessToken,
          excludeReplies: params.excludeReplies === true,
          excludeRetweets: params.excludeRetweets === true,
          maxResults: limit,
        },
      );

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
        error:
          'Could not resolve an X post id from targetPostIdOrUrl. Use a status link or bare numeric id.',
        success: false,
      };
    }

    const quoteContent = readOptionalString(params.quoteContent);
    if (action === 'quote' && !quoteContent) {
      return {
        creditsUsed: 0,
        error: 'quoteContent is required for draft_x_quote',
        success: false,
      };
    }

    const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
    const caption =
      action === 'quote'
        ? (quoteContent as string)
        : `[native repost] ${targetPostId}`;

    const batch = await this.batchGenerationService.createBatch(
      {
        brandId: brandId || undefined,
        count: 1,
        platforms: ['twitter'],
        source: 'proactive',
      } as never,
      ctx.userId,
      ctx.organizationId,
    );

    const batchId = String(batch.id);
    const targetAuthor = readOptionalString(params.targetAuthor);
    const targetPostContent = readOptionalString(params.targetPostContent);
    const targetPostUrl = buildTwitterStatusUrl(targetPostId, targetAuthor);

    await this.internalApi
      .callInternalApi(
        'POST',
        `/v1/batches/${batchId}/items`,
        {
          caption,
          engagementAction: action,
          platform: 'twitter',
          status: 'pending',
          targetAuthor,
          targetPostContent,
          targetPostId,
          targetPostUrl,
          type: 'engagement',
        },
        ctx,
      )
      .catch(() => {
        this.loggerService.warn(
          `Could not add ${action} engagement item to batch ${batchId}`,
          this.constructorName,
        );
      });

    return {
      creditsUsed: 1,
      data: {
        action,
        batchId,
        message:
          action === 'quote'
            ? 'Quote draft added to the review queue. It will not publish until approved.'
            : 'Repost draft added to the review queue. It will not publish until approved.',
        targetPostId,
        targetPostUrl,
      },
      requiresConfirmation: true,
      riskLevel: 'medium',
      success: true,
    };
  }
}
