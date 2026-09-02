import {
  BatchItemStatus,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PostsService } from '@server/collections/posts/services/posts.service';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentToolInternalApiService } from '@server/services/agent-orchestrator/tools/agent-tool-internal-api.service';
import { readOptionalString } from '@server/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  buildSingleDayBatchDto,
  createBatchThenAddItem,
} from '@server/services/agent-orchestrator/tools/create-batch-then-add-item';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';
import { TwitterService } from '@server/services/integrations/twitter/services/twitter.service';
import { mapTwitterApiError } from '@server/services/integrations/twitter/utils/twitter-api-error.util';
import { buildTwitterStatusUrl } from '@server/services/integrations/twitter/utils/twitter-post-id.util';

/**
 * Proactive agent tools: approval summary, performance, calendar, strategy bookkeeping.
 * Extracted from AgentToolExecutorService per #519.
 * Includes discover_engagements / draft_engagement_reply via AgentToolInternalApiService.
 * X search is wired through TwitterService so discovery never silently returns empty
 * for a missing trends endpoint (#2663).
 */
@Injectable()
export class AgentProactiveToolHandler {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly postsService: PostsService,
    private readonly internalApi: AgentToolInternalApiService,
    @Optional() private readonly twitterService?: TwitterService,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  async getApprovalSummary(
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const result = await this.batchGenerationService.getBatches(
      ctx.organizationId,
      { limit: 50 },
    );

    let totalPending = 0;
    let contentPending = 0;
    let engagementPending = 0;
    let oldestPendingAge = 0;

    for (const batch of result.items) {
      totalPending += batch.pendingCount ?? 0;
      // Aggregate counts based on source
      if (
        (batch as unknown as Record<string, unknown>).source === 'proactive'
      ) {
        engagementPending += batch.pendingCount ?? 0;
      } else {
        contentPending += batch.pendingCount ?? 0;
      }

      if (batch.createdAt) {
        const age = Date.now() - new Date(batch.createdAt as string).getTime();
        if (age > oldestPendingAge && (batch.pendingCount ?? 0) > 0) {
          oldestPendingAge = age;
        }
      }
    }

    const oldestPendingHours = Math.round(oldestPendingAge / 3600000);

    return {
      creditsUsed: 0,
      data: {
        contentPending,
        engagementPending,
        oldestPendingHours,
        totalBatches: result.total,
        totalPending,
      },
      success: true,
    };
  }

  async analyzePerformance(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const days = (params.days as number) || 30;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get published posts from the period
    const posts = await this.postsService.findAll(
      {
        where: {
          createdAt: { gte: startDate, lte: endDate },
          isDeleted: false,
          organizationId: ctx.organizationId,
          targetExecutionState: TargetExecutionState.PUBLISHED,
        },
        orderBy: { createdAt: -1 },
      },
      {},
    );

    const postDocs = (posts.docs ?? []) as unknown as Record<string, unknown>[];

    // Group by platform
    const byPlatform: Record<string, number> = {};
    for (const p of postDocs) {
      const plat = (p.platform as string) || 'unknown';
      byPlatform[plat] = (byPlatform[plat] || 0) + 1;
    }

    // Top performers by engagement
    const topPerformers = postDocs
      .filter((p) => p.engagement || p.likes || p.impressions)
      .sort(
        (a, b) =>
          ((b.engagement as number) || (b.likes as number) || 0) -
          ((a.engagement as number) || (a.likes as number) || 0),
      )
      .slice(0, 5)
      .map((p) => ({
        description: p.description,
        engagement: p.engagement ?? p.likes,
        id: String(p.id),
        platform: p.platform,
      }));

    return {
      creditsUsed: 0,
      data: {
        byPlatform,
        days,
        topPerformers,
        totalPosts: postDocs.length,
      },
      success: true,
    };
  }

  async getContentCalendar(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const days = (params.days as number) || 7;
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    // Get scheduled and draft posts for the coming week
    const posts = await this.postsService.findAll(
      {
        where: {
          OR: [
            { scheduledDate: { gte: now, lte: endDate } },
            { targetExecutionState: TargetExecutionState.DRAFT },
          ],
          isDeleted: false,
          organizationId: ctx.organizationId,
        },
        orderBy: { createdAt: -1, scheduledDate: 1 },
      },
      {},
    );

    const postDocs = (posts.docs ?? []) as unknown as Record<string, unknown>[];
    const scheduled = postDocs.filter((p) => p.scheduledDate);
    const drafts = postDocs.filter(
      (p) =>
        p.targetExecutionState === TargetExecutionState.DRAFT &&
        !p.scheduledDate,
    );

    // Find gap days (days with no scheduled content)
    const scheduledDates = new Set(
      scheduled.map(
        (p) => new Date(p.scheduledDate as string).toISOString().split('T')[0],
      ),
    );

    const gapDays: string[] = [];
    for (let d = 0; d < days; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      if (!scheduledDates.has(dateStr)) {
        gapDays.push(dateStr);
      }
    }

    return {
      creditsUsed: 0,
      data: {
        days,
        draftsCount: drafts.length,
        gapDays,
        gapsCount: gapDays.length,
        scheduled: scheduled.map((p) => ({
          description: p.description,
          id: String(p.id),
          platform: p.platform,
          scheduledDate: p.scheduledDate,
        })),
        scheduledCount: scheduled.length,
      },
      success: true,
    };
  }

  async updateStrategyState(
    params: Record<string, unknown>,
    _ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // This is a bookkeeping tool — the actual state update happens
    // in the CronProactiveAgentService after the agent run completes.
    // Here we just acknowledge the summary for the thread record.
    return {
      creditsUsed: 0,
      data: {
        contentGenerated: (params.contentGenerated as number) || 0,
        engagementsFound: (params.engagementsFound as number) || 0,
        recorded: true,
        repliesDrafted: (params.repliesDrafted as number) || 0,
        summary: params.summary as string,
      },
      success: true,
    };
  }

  async discoverEngagements(
    params: Record<string, unknown>,
    _ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const keywords = params.keywords as string[];
    const platform = params.platform as string;
    const limit = (params.limit as number) || 20;

    if (!keywords?.length || !platform) {
      return {
        creditsUsed: 0,
        error: 'keywords and platform are required',
        success: false,
      };
    }

    const query = keywords.join(' OR ');

    // X is first-class: call Twitter search directly (no dangling trends route).
    if (platform === 'twitter' || platform === 'x') {
      const twitterService = this.resolveTwitterService();
      if (!twitterService) {
        return {
          creditsUsed: 0,
          error: 'X integration is unavailable right now.',
          success: false,
        };
      }

      try {
        const tweets = await twitterService.searchRecentTweets(query, {
          maxResults: Math.min(Math.max(limit, 5), 25),
          sortOrder: 'relevancy',
        });

        return {
          creditsUsed: 1,
          data: {
            count: tweets.length,
            platform: 'twitter',
            posts: tweets.map((tweet) => ({
              author: tweet.authorUsername,
              content: tweet.text,
              engagement: tweet.engagement,
              id: tweet.id,
              url: buildTwitterStatusUrl(tweet.id, tweet.authorUsername),
            })),
            query,
          },
          success: true,
        };
      } catch (error: unknown) {
        const message = mapTwitterApiError(error);
        this.loggerService.error(
          `${this.constructorName} discoverEngagements X search failed`,
          { error: message, query },
        );
        return {
          creditsUsed: 0,
          error: message,
          success: false,
        };
      }
    }

    // No trends-search endpoint exists for non-X platforms yet — report the
    // gap instead of round-tripping through a route that was never built.
    return {
      creditsUsed: 0,
      error: `Engagement discovery is not configured for platform "${platform}".`,
      success: false,
    };
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

  async draftEngagementReply(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const targetPostId = readOptionalString(params.targetPostId);
    const replyContent = readOptionalString(params.replyContent);
    const platform = parsePlatform(params.platform);

    if (!targetPostId || !replyContent || !platform) {
      return {
        creditsUsed: 0,
        error: 'targetPostId, replyContent, and platform are required',
        success: false,
      };
    }

    const brandId = readOptionalString(params.brandId) ?? ctx.brandId;
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'Brand is required for engagement drafts.',
        success: false,
      };
    }

    const result = await createBatchThenAddItem(
      {
        batchGenerationService: this.batchGenerationService,
        internalApi: this.internalApi,
        logger: this.loggerService,
      },
      {
        batchDto: buildSingleDayBatchDto(brandId, platform),
        ctx,
        item: {
          caption: replyContent,
          platform,
          status: BatchItemStatus.PENDING,
          targetAuthor: readOptionalString(params.targetAuthor),
          targetPostContent: readOptionalString(params.targetPostContent),
          targetPostId,
          targetPostUrl: readOptionalString(params.targetPostUrl),
          type: 'engagement',
        },
      },
    );

    if (!result.success) {
      return {
        creditsUsed: 0,
        error: result.error,
        success: false,
      };
    }

    return {
      creditsUsed: 1,
      data: {
        batchId: result.batchId,
        message:
          'Reply draft is ready for review. Nothing posts until you approve it.',
        platform,
        targetPostId,
      },
      success: true,
    };
  }
}
