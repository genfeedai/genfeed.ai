/**
 * Articles Analytics Service
 * Handles analytics, metrics, and virality analysis:
 * - Analyze article virality potential
 * - Track performance metrics
 * - Calculate engagement scores
 * - Generate analytics reports
 *
 * This service focuses on data analysis and metrics
 * to help understand article performance and potential.
 */
import { ViralityAnalysisResponse } from '@api/collections/articles/dto/analyze-virality.dto';
import type {
  ArticleDocument,
  ArticleViralityAnalysis,
} from '@api/collections/articles/schemas/article.schema';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import {
  buildViralityAnalysisResponse,
  normalizePerformanceMetrics,
  ParsedViralityResponse,
} from '@api/collections/articles/utils/virality-analysis.mapper';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigService } from '@api/config/config.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import {
  calculateEstimatedTextCredits,
  getMinimumTextCredits,
} from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { Article as PrismaArticle } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';

@Injectable()
export class ArticlesAnalyticsService {
  private readonly constructorName = this.constructor.name;
  private static readonly TEXT_MAX_OVERDRAFT_CREDITS = 5;

  constructor(
    private readonly logger: LoggerService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly templatesService?: TemplatesService,
    @Optional() private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional() private readonly modelsService?: ModelsService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional()
    private readonly articleAnalyticsService?: ArticleAnalyticsService,
  ) {}

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private readNumberRecord(value: unknown): Record<string, number> {
    if (!value || typeof value !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        typeof entry === 'number' && Number.isFinite(entry)
          ? [[key, entry]]
          : [],
      ),
    );
  }

  private readViralityAnalysis(
    value: unknown,
  ): ArticleViralityAnalysis | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const record = this.readObjectRecord(value);
    const score = this.readNumber(record.score);
    if (score === undefined) {
      return undefined;
    }

    const analyzedAt = record.analyzedAt;

    return {
      score,
      factors: this.readNumberRecord(record.factors),
      predictions: this.readNumberRecord(record.predictions),
      suggestions: this.readStringArray(record.suggestions),
      ...(analyzedAt instanceof Date || typeof analyzedAt === 'string'
        ? { analyzedAt }
        : {}),
    };
  }

  private normalizeArticle(
    article: PrismaArticle & Partial<ArticleDocument>,
  ): ArticleDocument {
    const record = this.readObjectRecord(article);

    return {
      ...article,
      _id: article.mongoId ?? article.id,
      brand: this.readString(record.brand) ?? article.brandId ?? undefined,
      category: this.readString(record.category),
      label: this.readString(record.label) ?? article.title,
      organization:
        this.readString(record.organization) ?? article.organizationId,
      summary: this.readString(record.summary) ?? article.excerpt ?? undefined,
      user: this.readString(record.user) ?? article.userId,
      viralityAnalysis: this.readViralityAnalysis(record.viralityAnalysis),
    };
  }

  /**
   * Analyze article virality potential using AI
   */
  async analyzeVirality(
    article: ArticleDocument,
  ): Promise<ViralityAnalysisResponse> {
    const normalizedArticle = this.normalizeArticle(article);

    try {
      this.logger.debug(`${this.constructorName} analyzeVirality`, {
        articleId: normalizedArticle._id,
      });

      if (!this.replicateService || !this.configService) {
        throw new Error('Replicate service not available');
      }

      if (!this.templatesService || !normalizedArticle.organization) {
        throw new Error('Template service not available');
      }

      // Get user prompt from template
      const userPrompt = await this.templatesService.getRenderedPrompt(
        PromptTemplateKey.ARTICLE_VIRALITY,
        {
          category: normalizedArticle.category,
          content: normalizedArticle.content,
          summary: normalizedArticle.summary,
          title: normalizedArticle.label,
        },
        String(normalizedArticle.organization),
      );

      if (!userPrompt) {
        throw new Error('Template service not available');
      }

      await this.assertDefaultTextCreditsAvailable(normalizedArticle);

      // Build prompt with PromptBuilderService then call Replicate
      const { input } = (await this.promptBuilderService?.buildPrompt(
        DEFAULT_TEXT_MODEL,
        {
          modelCategory: ModelCategory.TEXT,
          prompt: userPrompt,
          promptTemplate: PromptTemplateKey.TEXT_VIRALITY,
          systemPromptTemplate: SystemPromptKey.VIRALITY,
          temperature: 0.7,
        },
      )) || { input: {} };

      const responseText =
        await this.replicateService.generateTextCompletionSync(
          DEFAULT_TEXT_MODEL,
          input,
        );

      await this.settleDefaultTextCredits(
        normalizedArticle,
        input,
        responseText,
      );

      // Parse JSON response
      let response: ParsedViralityResponse;
      try {
        response = JSON.parse(responseText) as ParsedViralityResponse;
      } catch (parseError) {
        this.logger.error('Failed to parse virality analysis JSON', {
          parseError,
          responseText,
        });
        throw new Error('Invalid JSON response from AI service');
      }

      // Validate + build analysis via shared mapper
      const result = buildViralityAnalysisResponse(
        normalizedArticle._id.toString(),
        response,
      );

      this.logger.log(`${this.constructorName} completed virality analysis`, {
        articleId: normalizedArticle._id,
        score: result.analysis.score,
      });

      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} analyzeVirality failed`, {
        articleId: normalizedArticle._id,
        error,
      });
      throw error;
    }
  }

  /**
   * Update article performance metrics (called by analytics service or webhooks)
   * Now uses the separate article-analytics collection instead of embedded metrics
   */
  async updatePerformanceMetrics(
    articleId: string,
    metrics: {
      views?: number;
      shares?: number;
      likes?: number;
      comments?: number;
      clickThroughRate?: number;
    },
  ): Promise<void> {
    try {
      this.logger.debug(`${this.constructorName} updatePerformanceMetrics`, {
        articleId,
        metrics,
      });

      if (!this.articleAnalyticsService) {
        this.logger.warn(
          `${this.constructorName} ArticleAnalyticsService not available, skipping metrics update`,
        );
        return;
      }

      // Use the new article-analytics collection
      await this.articleAnalyticsService.updatePerformanceMetrics(
        articleId,
        normalizePerformanceMetrics(metrics),
      );

      this.logger.log(`${this.constructorName} updated performance metrics`, {
        articleId,
      });
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} updatePerformanceMetrics failed`,
        {
          articleId,
          error,
        },
      );
      throw error;
    }
  }

  /**
   * Calculate engagement score based on various metrics
   * Returns normalized score 0-100
   * Now uses the separate article-analytics collection
   */
  async calculateEngagementScore(articleId: string): Promise<number> {
    try {
      this.logger.debug(`${this.constructorName} calculateEngagementScore`, {
        articleId,
      });

      if (!this.articleAnalyticsService) {
        this.logger.warn(
          `${this.constructorName} ArticleAnalyticsService not available, returning 0`,
        );
        return 0;
      }

      const summary =
        await this.articleAnalyticsService.getArticleAnalyticsSummary(
          articleId,
        );

      if (
        summary.totalViews === 0 &&
        summary.totalLikes === 0 &&
        summary.totalComments === 0 &&
        summary.totalShares === 0
      ) {
        return 0;
      }

      // Weighted scoring algorithm
      const viewsScore = Math.min(summary.totalViews / 1000, 1) * 25; // Max 25 points
      const sharesScore = Math.min(summary.totalShares / 100, 1) * 30; // Max 30 points
      const likesScore = Math.min(summary.totalLikes / 200, 1) * 20; // Max 20 points
      const commentsScore = Math.min(summary.totalComments / 50, 1) * 25; // Max 25 points

      const totalScore = viewsScore + sharesScore + likesScore + commentsScore;

      this.logger.debug(`${this.constructorName} calculated engagement score`, {
        articleId,
        score: totalScore,
      });

      return Math.round(totalScore);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} calculateEngagementScore failed`,
        {
          articleId,
          error,
        },
      );
      throw error;
    }
  }

  /**
   * Generate comprehensive analytics report for article
   */
  async generateAnalyticsReport(
    articleId: string,
    timeframe: 'day' | 'week' | 'month' = 'week',
  ): Promise<Record<string, unknown>> {
    try {
      this.logger.log(`${this.constructorName} generateAnalyticsReport`, {
        articleId,
        timeframe,
      });

      const articleRecord = await this.prisma?.article.findUnique({
        where: { id: articleId },
      });
      if (!articleRecord) {
        throw new NotFoundException('Article not found');
      }
      const article = this.normalizeArticle(articleRecord);

      const engagementScore = await this.calculateEngagementScore(articleId);

      // Get metrics from the new analytics collection
      let performanceMetrics: unknown = {
        clickThroughRate: 0,
        comments: 0,
        engagementRate: 0,
        likes: 0,
        shares: 0,
        views: 0,
      };

      if (this.articleAnalyticsService) {
        const summary =
          await this.articleAnalyticsService.getArticleAnalyticsSummary(
            articleId,
          );
        performanceMetrics = {
          clickThroughRate: summary.avgClickThroughRate,
          comments: summary.totalComments,
          engagementRate: summary.avgEngagementRate,
          lastUpdated: summary.lastUpdated,
          likes: summary.totalLikes,
          shares: summary.totalShares,
          views: summary.totalViews,
        };
      }

      const report = {
        articleId,
        engagementScore,
        generatedAt: new Date(),
        insights: {
          recommendations: this.getRecommendations(article, engagementScore),
          topPerformingFactors: this.getTopPerformingFactors(article),
        },
        overview: {
          category: article.category,
          publishedAt: article.publishedAt,
          slug: article.slug,
          status: article.status,
          title: article.label,
        },
        performanceMetrics,
        timeframe,
        viralityAnalysis: article.viralityAnalysis || null,
      };

      this.logger.log(`${this.constructorName} generated analytics report`, {
        articleId,
        engagementScore,
      });

      return report;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} generateAnalyticsReport failed`,
        {
          articleId,
          error,
        },
      );
      throw error;
    }
  }

  private async assertDefaultTextCreditsAvailable(
    article: ArticleDocument,
  ): Promise<void> {
    const organizationId = this.getObjectIdString(article.organization);
    if (!organizationId || !this.creditsUtilsService || !this.modelsService) {
      return;
    }

    const model = await this.getDefaultTextModel();
    const requiredCredits = getMinimumTextCredits(model);
    if (requiredCredits <= 0) {
      return;
    }

    const hasCredits =
      await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        organizationId,
        requiredCredits,
      );

    if (hasCredits) {
      return;
    }

    const currentBalance =
      await this.creditsUtilsService.getOrganizationCreditsBalance(
        organizationId,
      );
    throw new Error(
      `Insufficient credits: ${requiredCredits} required, ${currentBalance} available`,
    );
  }

  private async settleDefaultTextCredits(
    article: ArticleDocument,
    input: Record<string, unknown>,
    output: string,
  ): Promise<void> {
    const organizationId = this.getObjectIdString(article.organization);
    const userId = this.getObjectIdString(article.user);
    if (
      !organizationId ||
      !userId ||
      !this.creditsUtilsService ||
      !this.modelsService
    ) {
      return;
    }

    const model = await this.getDefaultTextModel();
    const amount = calculateEstimatedTextCredits(model, input, output);
    if (amount <= 0) {
      return;
    }

    await this.creditsUtilsService.deductCreditsFromOrganization(
      organizationId,
      userId,
      amount,
      'Article virality analysis',
      ActivitySource.ARTICLE_VIRALITY_ANALYSIS,
      {
        maxOverdraftCredits:
          ArticlesAnalyticsService.TEXT_MAX_OVERDRAFT_CREDITS,
      },
    );
  }

  private getObjectIdString(value: unknown): string | undefined {
    if (!value) {
      return undefined;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'object' &&
      value !== null &&
      'toString' in value &&
      typeof value.toString === 'function'
    ) {
      return value.toString();
    }

    return undefined;
  }

  private async getDefaultTextModel() {
    const model = await this.modelsService?.findOne({
      isDeleted: false,
      key: baseModelKey(DEFAULT_TEXT_MODEL),
    });

    if (!model) {
      throw new Error(
        `Model pricing is not configured for ${DEFAULT_TEXT_MODEL}`,
      );
    }

    return model;
  }

  /**
   * Get top performing factors from virality analysis
   */
  private getTopPerformingFactors(article: ArticleDocument): string[] {
    const factors = article.viralityAnalysis?.factors;
    if (!factors) {
      return [];
    }

    const factorEntries = Object.entries(factors);

    return factorEntries
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 3)
      .map(([key]) => key);
  }

  /**
   * Get recommendations based on engagement score
   */
  private getRecommendations(
    article: ArticleDocument,
    engagementScore: number,
  ): string[] {
    const recommendations: string[] = [];

    if (engagementScore < 30) {
      recommendations.push('Consider improving content quality and headlines');
      recommendations.push('Add more visual elements (images, videos)');
      recommendations.push('Optimize for SEO to increase discoverability');
    } else if (engagementScore < 60) {
      recommendations.push('Promote on social media channels');
      recommendations.push('Add call-to-action to encourage engagement');
      recommendations.push('Update content with fresh information');
    } else {
      recommendations.push('Content is performing well - maintain quality');
      recommendations.push('Consider creating similar content');
      recommendations.push('Leverage this content for cross-promotion');
    }

    // Add virality-specific recommendations
    const suggestions = article.viralityAnalysis?.suggestions;
    if (suggestions) {
      recommendations.push(...suggestions.slice(0, 2));
    }

    return recommendations;
  }
}
