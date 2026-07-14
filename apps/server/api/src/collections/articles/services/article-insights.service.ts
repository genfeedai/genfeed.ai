import { ViralityAnalysisResponse } from '@api/collections/articles/dto/analyze-virality.dto';
import type { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import {
  buildViralityAnalysisResponse,
  normalizePerformanceMetrics,
} from '@api/collections/articles/utils/virality-analysis.mapper';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { DEFAULT_MINI_TEXT_MODEL } from '@api/constants/default-mini-text-model.constant';
import { TEXT_GENERATION_LIMITS } from '@api/constants/text-generation-limits.constant';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import {
  ModelCategory,
  PromptTemplateKey,
  SystemPromptKey,
} from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, Optional } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

type ArticleFinder = (
  criteria: Record<string, unknown>,
) => Promise<ArticleDocument | null>;
type ArticlePatcher = (
  articleId: string,
  updates: Partial<UpdateArticleDto>,
) => Promise<unknown>;

@Injectable()
export class ArticleInsightsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    @Optional() private readonly replicateService?: ReplicateService,
    @Optional() private readonly promptBuilderService?: PromptBuilderService,
    @Optional() private readonly templatesService?: TemplatesService,
    @Optional()
    private readonly articleAnalyticsService?: ArticleAnalyticsService,
  ) {}

  async analyzeVirality(
    articleId: string,
    userId: string,
    organizationId: string,
    findArticle: ArticleFinder,
    patchArticle: ArticlePatcher,
  ): Promise<ViralityAnalysisResponse> {
    try {
      this.logger.debug(`${this.constructorName} analyzeVirality`, {
        articleId,
      });

      const article = await findArticle({
        id: articleId,
        OR: [{ userId }, { organizationId }],
        isDeleted: false,
      });
      if (!article) {
        throw new NotFoundException('Article');
      }
      if (!this.replicateService || !this.configService) {
        throw new Error('OpenAI service not available');
      }

      const userPrompt = await this.templatesService?.getRenderedPrompt(
        PromptTemplateKey.ARTICLE_VIRALITY,
        {
          category: article.category,
          content: article.content,
          summary: article.summary,
          title: article.label,
        },
        organizationId,
      );
      if (!userPrompt) {
        throw new Error('Template service not available');
      }

      const { input: viralityInput } =
        (await this.promptBuilderService?.buildPrompt(
          DEFAULT_MINI_TEXT_MODEL,
          {
            maxTokens: TEXT_GENERATION_LIMITS.articleVirality,
            modelCategory: ModelCategory.TEXT,
            prompt: userPrompt,
            promptTemplate: PromptTemplateKey.TEXT_VIRALITY,
            systemPromptTemplate: SystemPromptKey.VIRALITY,
            temperature: 0.7,
          },
          organizationId,
        )) || { input: {} };
      const responseText =
        await this.replicateService.generateTextCompletionSync(
          DEFAULT_MINI_TEXT_MODEL,
          viralityInput,
        );

      let response: unknown;
      try {
        response = JSON.parse(responseText) as unknown;
      } catch (parseError) {
        this.logger.error('Failed to parse virality analysis JSON', {
          parseError,
          responseText: responseText.substring(0, 500),
        });
        throw new Error('Invalid JSON response from AI service');
      }

      const result = buildViralityAnalysisResponse(articleId, response);
      await patchArticle(articleId, { viralityAnalysis: result.analysis });

      this.logger.log(`${this.constructorName} completed virality analysis`, {
        articleId,
        score: result.analysis.score,
      });
      return result;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} analyzeVirality failed`, {
        articleId,
        error,
      });
      throw error;
    }
  }

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
        { articleId, error },
      );
      throw error;
    }
  }

  async generatePromptFromArticle(
    articleId: string,
    userId: string,
    organizationId: string,
    findArticle: ArticleFinder,
    patchArticle: ArticlePatcher,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.logger.debug(`${url} started`, { articleId });
      const article = await findArticle({
        id: articleId,
        OR: [{ userId }, { organizationId }],
        isDeleted: false,
      });
      if (!article) {
        throw new NotFoundException('Article');
      }
      if (!this.replicateService) {
        throw new Error('OpenAI service not available');
      }

      const contentForPrompt =
        article.content && typeof article.content === 'string'
          ? article.content.substring(0, 2000)
          : '';
      const userPrompt = await this.templatesService?.getRenderedPrompt(
        PromptTemplateKey.ARTICLE_IMAGE_PROMPT,
        {
          content: contentForPrompt,
          summary: article.summary,
          title: article.label,
        },
        organizationId,
      );
      if (!userPrompt) {
        throw new Error('Template service not available');
      }

      const { input: imagePromptInput } =
        (await this.promptBuilderService?.buildPrompt(
          DEFAULT_MINI_TEXT_MODEL,
          {
            maxTokens: TEXT_GENERATION_LIMITS.articleImagePrompt,
            modelCategory: ModelCategory.TEXT,
            prompt: userPrompt,
            promptTemplate: PromptTemplateKey.TEXT_IMAGE_PROMPT,
            systemPromptTemplate: SystemPromptKey.IMAGE_PROMPT,
            temperature: 0.8,
          },
          organizationId,
        )) || { input: {} };
      const responseText =
        await this.replicateService.generateTextCompletionSync(
          DEFAULT_MINI_TEXT_MODEL,
          imagePromptInput,
        );
      if (!responseText) {
        throw new Error('Failed to generate prompt from AI service');
      }

      await patchArticle(articleId, {
        generationPrompt: responseText.trim(),
      });
      this.logger.log(`${url} completed`, {
        articleId,
        promptLength: responseText.length,
      });
      return responseText.trim();
    } catch (error: unknown) {
      this.logger.error(`${url} failed`, { articleId, error });
      throw error;
    }
  }
}
