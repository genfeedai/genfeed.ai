import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { AgentScopeContextService } from '@api/index';
import { AgentPublishToolHandler } from '@api/services/agent-orchestrator/tools/agent-publish-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { PostVisibility, TargetExecutionState } from '@genfeedai/contracts';
import type {
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
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
    // Articles are a separate collection, not an `IngredientCategory`, so a
    // `contentId` naming an article never resolves through `ingredientsService`.
    // Both are `@Optional()` for the same reason the ingredient one is: the
    // owning module is wired with `forwardRef`, and analytics must degrade to
    // "not found" rather than crash if the cycle leaves a provider unresolved.
    @Optional()
    private readonly articlesService?: ArticlesService,
    @Optional()
    private readonly articleAnalyticsService?: ArticleAnalyticsService,
  ) {}
  private async resolveIngredientForContent(
    contentId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.ingredientsService || !contentId) {
      return null;
    }

    return (await this.ingredientsService.findOne({
      id: contentId,
      organizationId: organizationId,
    })) as unknown as Record<string, unknown> | null;
  }
  private async resolveArticleForContent(
    contentId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!this.articlesService || !contentId) {
      return null;
    }

    return (await this.articlesService.findOne({
      id: contentId,
      isDeleted: false,
      organizationId: organizationId,
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
          organizationId: organizationId,
          targetExecutionState: TargetExecutionState.PUBLISHED,
        },
        orderBy: {
          createdAt: -1,
          publicationDate: -1,
        },
      },
      // Only the newest published post is read — never load the whole history.
      { limit: 1, page: 1 },
    );

    const [post] =
      (results.docs as unknown as Record<string, unknown>[] | undefined) ?? [];
    return post ?? null;
  }

  /**
   * Articles attach to a post through the polymorphic `entityArticleId` scalar
   * FK, not through the `post_ingredients` m2m relation the ingredient lookup
   * uses — so this needs its own query rather than a shared one.
   */
  private async resolveLatestPublishedPostForArticle(
    articleId: string,
    organizationId: string,
  ): Promise<Record<string, unknown> | null> {
    const results = await this.postsService.findAll(
      {
        where: {
          entityArticleId: articleId,
          isDeleted: false,
          organizationId: organizationId,
          targetExecutionState: TargetExecutionState.PUBLISHED,
        },
        orderBy: {
          createdAt: -1,
          publicationDate: -1,
        },
      },
      // Only the newest published post is read — never load the whole history.
      { limit: 1, page: 1 },
    );

    const [post] =
      (results.docs as unknown as Record<string, unknown>[] | undefined) ?? [];
    return post ?? null;
  }

  /** The four-metric card shared by every per-item analytics response. */
  private buildEngagementMetrics(summary: {
    avgEngagementRate: number;
    totalComments: number;
    totalLikes: number;
    totalViews: number;
  }): Record<string, unknown> {
    return this.buildMetricItems([
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

  /**
   * Analytics for a `contentId` that names an article.
   *
   * An article carries two independent metric sources: its own on-site rollup in
   * `article_analytics`, and — once distributed — the post analytics of the post
   * that published it. Both are returned; the post summary heads the metric card
   * when it exists, because that is where platform engagement lands.
   */
  private async buildArticleAnalyticsResult(
    article: Record<string, unknown>,
    contentId: string,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // Scalar FK — `assertResourceScope` rejects an undefined resource brand.
    this.assertResourceScope(
      ctx,
      readOptionalString(article.brandId),
      'selected content',
    );

    const articleSummary = this.articleAnalyticsService
      ? await this.articleAnalyticsService.getArticleAnalyticsSummary(
          contentId,
          ctx.organizationId,
        )
      : null;

    const publishedPost = await this.resolveLatestPublishedPostForArticle(
      contentId,
      ctx.organizationId,
    );
    const postId = publishedPost?.id ? String(publishedPost.id) : undefined;
    const postSummary = postId
      ? await this.postAnalyticsService.getPostAnalyticsSummary(postId)
      : null;

    if (!postSummary && !articleSummary) {
      return {
        creditsUsed: 0,
        data: {
          articleId: contentId,
          contentId,
          message:
            'This article has no analytics yet. Publish it to start collecting metrics.',
        },
        success: true,
      };
    }

    const metrics = this.buildEngagementMetrics(
      postSummary ?? {
        avgEngagementRate: articleSummary?.avgEngagementRate ?? 0,
        totalComments: articleSummary?.totalComments ?? 0,
        totalLikes: articleSummary?.totalLikes ?? 0,
        totalViews: articleSummary?.totalViews ?? 0,
      },
    );

    return {
      creditsUsed: 0,
      data: {
        articleId: contentId,
        articleSummary,
        contentId,
        ...(postId ? { postId, summary: postSummary } : {}),
      },
      nextActions: [
        postId
          ? this.buildPostAnalyticsSnapshotAction({
              metrics,
              postId,
              title: 'Article analytics snapshot',
            })
          : {
              ctas: [
                { href: '/analytics/overview', label: 'Open analytics' },
                { href: '/content/articles', label: 'Open articles' },
              ],
              description:
                'On-site analytics for this article. It has not been published to a social post yet.',
              id: `article-analytics-${contentId}-${Date.now()}`,
              metrics,
              title: 'Article analytics snapshot',
              type: 'analytics_snapshot_card' as const,
            },
      ],
      success: true,
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
        id: postId,
        organizationId: ctx.organizationId,
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
        readOptionalString(post.brandId),
        'selected post',
      );

      const summary =
        await this.postAnalyticsService.getPostAnalyticsSummary(postId);
      const metrics = this.buildEngagementMetrics(summary);

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
        // Not an ingredient — the id may name an article, which lives in its
        // own collection with its own analytics store.
        const article = await this.resolveArticleForContent(
          contentId,
          ctx.organizationId,
        );

        if (article) {
          return await this.buildArticleAnalyticsResult(
            article,
            contentId,
            ctx,
          );
        }

        return {
          creditsUsed: 0,
          error: `Content ${contentId} not found`,
          success: false,
        };
      }

      // Scalar FK — `assertResourceScope` rejects an undefined resource brand.
      const brandId = readOptionalString(ingredient.brandId);
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
              visibility: PostVisibility.PUBLIC,
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
      const metrics = this.buildEngagementMetrics(summary);

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
          // Single dashboard CTA — period switching is client-side when
          // multiple snapshots exist in the thread. Automation analytics is a
          // different surface and is not the right link for org overview cards.
          ctas: [{ href: '/analytics/overview', label: 'Open analytics' }],
          data: { overview, period },
          // Stable per org+period so tool_complete + done metadata dedupe, and
          // re-runs replace the prior snapshot instead of stacking clones.
          id: `analytics-snapshot:${ctx.organizationId}:${period}`,
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
