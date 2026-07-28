import { PostsService } from '@api/collections/posts/services/posts.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { PostStatus } from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Proactive agent tools: approval summary, performance, calendar, strategy bookkeeping.
 * Extracted from AgentToolExecutorService per #519.
 * (discover_engagements / draft_engagement_reply remain on executor — they need callInternalApi.)
 */
@Injectable()
export class AgentProactiveToolHandler {
  constructor(
    private readonly postsService: PostsService,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
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
          organization: ctx.organizationId,
          status: PostStatus.PUBLIC,
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
            { status: PostStatus.DRAFT },
          ],
          isDeleted: false,
          organization: ctx.organizationId,
        },
        orderBy: { createdAt: -1, scheduledDate: 1 },
      },
      {},
    );

    const postDocs = (posts.docs ?? []) as unknown as Record<string, unknown>[];
    const scheduled = postDocs.filter((p) => p.scheduledDate);
    const drafts = postDocs.filter(
      (p) => p.status === PostStatus.DRAFT && !p.scheduledDate,
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
}
