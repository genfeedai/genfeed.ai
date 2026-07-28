import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { resolveRelationId } from '@api/shared/utils/relation-id/relation-id.util';
import { PostStatus } from '@genfeedai/enums';
import type { AgentToolResult, AgentUiAction } from '@genfeedai/interfaces';
import { AgentScopeContextService } from '@genfeedai/server';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Analytics tools extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentAnalyticsToolHandler {
  constructor(
    private readonly postsService: PostsService,
    private readonly analyticsService: AnalyticsService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly publishHandler: AgentPublishToolHandler,
    @Optional()
    private readonly ingredientsService?: IngredientsService,
    @Optional()
    private readonly agentScopeContextService?: AgentScopeContextService,
  ) {}
  private async resolveIngredientForContent(
    contentId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ingredientsService || !contentId) {
      return null;
    }

    return (await this.ingredientsService.findOne({
      _id: contentId,
      isDeleted: false,
      organization: organizationId,
    })) as unknown as Record<string, unknown> | null;
  }
  private buildMetricItems(
    items: Array<{
      change?: number;
      decimals?: number;
      label: string;
      suffix?: string;
      value: number;
    }>,
  ): Record<string, unknown> {
    return {
      items,
    };
  }
  private async resolveLatestPublishedPostForIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    const results = await this.postsService.findAll(
      {
        where: {
          ingredients: ingredientId,
          isDeleted: false,
          organization: organizationId,
          status: {
            in: [PostStatus.PUBLIC, PostStatus.PRIVATE, PostStatus.UNLISTED],
          },
        },
        orderBy: {
          createdAt: -1,
          publicationDate: -1,
        },
      },
      { pagination: false },
    );

    const [post] =
      (results.docs as unknown as Record<string, unknown>[] | undefined) ?? [];
    return post ?? null;
  }

  private buildPostAnalyticsSnapshotAction(params: {
    metrics: Record<string, unknown>;
    postId: string;
    title: string;
  }): AgentUiAction {
    return {
      ctas: [
        {
          href: `/analytics/posts?postId=${params.postId}`,
          label: 'Open analytics',
        },
        { href: '/content/posts', label: 'Open posts' },
      ],
      description: 'Latest analytics for this published content.',
      id: `post-analytics-${params.postId}-${Date.now()}`,
      metrics: params.metrics,
      title: params.title,
      type: 'analytics_snapshot_card' as const,
    };
  }

  async getAnalytics(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const postId =
      typeof params.postId === 'string' && params.postId.trim().length > 0
        ? params.postId.trim()
        : undefined;
    const contentId =
      typeof params.contentId === 'string' && params.contentId.trim().length > 0
        ? params.contentId.trim()
        : typeof params.ingredientId === 'string' &&
            params.ingredientId.trim().length > 0
          ? params.ingredientId.trim()
          : undefined;

    if (postId) {
      const post = await this.postsService.findOne({
        _id: postId,
        isDeleted: false,
        organization: ctx.organizationId,
      });

      if (!post) {
        return {
          creditsUsed: 0,
          error: `Post ${postId} not found`,
          success: false,
        };
      }

      this.assertResourceScope(
        ctx,
        readOptionalString(post.brand),
        'selected post',
      );

      const summary =
        await this.postAnalyticsService.getPostAnalyticsSummary(postId);
      const metrics = this.buildMetricItems([
        { label: 'Views', value: summary.totalViews },
        { label: 'Likes', value: summary.totalLikes },
        { label: 'Comments', value: summary.totalComments },
        {
          decimals: 1,
          label: 'Engagement',
          suffix: '%',
          value: summary.avgEngagementRate,
        },
      ]);

      return {
        creditsUsed: 0,
        data: {
          postId,
          summary,
        },
        nextActions: [
          this.buildPostAnalyticsSnapshotAction({
            metrics,
            postId,
            title: 'Post analytics snapshot',
          }),
        ],
        success: true,
      };
    }

    if (contentId) {
      const ingredient = await this.resolveIngredientForContent(
        contentId,
        ctx.organizationId,
      );

      if (!ingredient) {
        return {
          creditsUsed: 0,
          error: `Content ${contentId} not found`,
          success: false,
        };
      }

      // Scalar FK — `assertResourceScope` rejects an undefined resource brand.
      const brandId = resolveRelationId(ingredient.brandId, ingredient.brand);
      this.assertResourceScope(ctx, brandId, 'selected content');

      const publishedPost = await this.resolveLatestPublishedPostForIngredient(
        contentId,
        ctx.organizationId,
      );

      if (!publishedPost?.id) {
        const publishCardResult =
          await this.publishHandler.buildPublishCardResult(
            {
              contentId,
            },
            ctx,
          );

        return {
          creditsUsed: 0,
          data: {
            contentId,
            message:
              'This content does not have a published post yet, so analytics are not available.',
          },
          nextActions: publishCardResult.nextActions,
          success: true,
        };
      }

      const resolvedPostId = String(publishedPost.id);
      const summary =
        await this.postAnalyticsService.getPostAnalyticsSummary(resolvedPostId);
      const metrics = this.buildMetricItems([
        { label: 'Views', value: summary.totalViews },
        { label: 'Likes', value: summary.totalLikes },
        { label: 'Comments', value: summary.totalComments },
        {
          decimals: 1,
          label: 'Engagement',
          suffix: '%',
          value: summary.avgEngagementRate,
        },
      ]);

      return {
        creditsUsed: 0,
        data: {
          contentId,
          postId: resolvedPostId,
          summary,
        },
        nextActions: [
          this.buildPostAnalyticsSnapshotAction({
            metrics,
            postId: resolvedPostId,
            title: 'Content analytics snapshot',
          }),
        ],
        success: true,
      };
    }

    const period = (params.period as string) || '30d';
    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period] || 30;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const overview = (await this.analyticsService.getOverview(
      startDate.toISOString(),
      endDate.toISOString(),
      undefined,
      ctx.organizationId,
    )) as {
      avgEngagementRate?: number;
      growth?: {
        engagement?: number;
        posts?: number;
        views?: number;
      };
      totalEngagement?: number;
      totalPosts?: number;
      totalViews?: number;
    };

    return {
      creditsUsed: 0,
      data: { overview, period },
      nextActions: [
        {
          ctas: [
            { href: '/analytics/overview', label: 'Open analytics dashboard' },
            {
              href: '/automation/analytics',
              label: 'Open automation analytics',
            },
          ],
          data: { overview, period },
          id: `analytics-${Date.now()}`,
          metrics: this.buildMetricItems([
            {
              change: overview.growth?.views,
              label: 'Views',
              value: overview.totalViews ?? 0,
            },
            {
              change: overview.growth?.engagement,
              label: 'Engagement',
              value: overview.totalEngagement ?? 0,
            },
            {
              change: overview.growth?.posts,
              label: 'Posts',
              value: overview.totalPosts ?? 0,
            },
            {
              decimals: 1,
              label: 'Avg engagement',
              suffix: '%',
              value: overview.avgEngagementRate ?? 0,
            },
          ]),
          title: `Analytics summary (${period})`,
          type: 'analytics_snapshot_card',
        },
      ],
      success: true,
    };
  }
  private assertResourceScope(
    ctx: ToolExecutionContext,
    resourceBrandId: string | undefined,
    resourceLabel: string,
  ): void {
    if (!ctx.threadId) {
      return;
    }

    if (!ctx.validatedScope || !this.agentScopeContextService) {
      throw new Error(
        'Validated agent scope is required for scoped resource access.',
      );
    }

    this.agentScopeContextService.assertResourceBrand(
      ctx.validatedScope,
      resourceBrandId,
      resourceLabel,
    );
  }
}
