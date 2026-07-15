import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { PromptEntity } from '@api/collections/prompts/entities/prompt.entity';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ArticleStatus,
  AssetScope,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';
import type {
  ArticleGenerationResponse,
  GeneratedArticleData,
} from '@genfeedai/interfaces/content/article.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

@Injectable()
export class ArticleContentPersistenceService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly logger: LoggerService,
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly promptsService?: PromptsService,
    @Optional()
    private readonly websocketService?: NotificationsPublisherService,
  ) {}

  private get articlesService(): ArticlesService | undefined {
    try {
      return this.moduleRef.get(ArticlesService, { strict: false });
    } catch {
      return undefined;
    }
  }

  /**
   * Update article with enhanced content from OpenAI response
   */
  async updateArticleWithEnhancedContent(
    article: ArticleDocument,
    response: ArticleGenerationResponse,
    prompt: string,
    _assistantId: string | undefined,
    userId: string,
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    try {
      // Extract article data from response
      // Response can be: { articles: [...] } or direct article object with { label, summary, content }
      let articleData: GeneratedArticleData;
      if (
        response.articles &&
        Array.isArray(response.articles) &&
        response.articles.length > 0
      ) {
        articleData = response.articles[0];
      } else if (response.label || response.content || response.summary) {
        // Direct article format
        articleData = response as GeneratedArticleData;
      } else {
        this.logger.error('Invalid response format from OpenAI assistant', {
          hasArticles: !!response.articles,
          isArray: Array.isArray(response.articles),
          responseKeys: Object.keys(response),
        });
        throw new Error('Invalid response format from AI assistant');
      }

      // Assistant returns ONLY changed fields - build update data accordingly
      const updateData: Record<string, unknown> = {
        'aiGeneration.completedAt': new Date(),
        status: ArticleStatus.DRAFT,
      };

      if (articleData.label) {
        updateData.label = articleData.label.substring(0, 200);
      }

      if (articleData.summary) {
        updateData.summary = articleData.summary.substring(0, 500);
      }

      if (articleData.content) {
        updateData.content = articleData.content;
      }

      if (articleData.slug) {
        // Ensure slug is unique if being changed
        let slug = articleData.slug
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .trim();

        if (slug !== article.slug) {
          let counter = 1;
          while (await this.slugExists(slug, organizationId, brandId)) {
            slug = `${articleData.slug}-${counter}`;
            counter++;
          }
          updateData.slug = slug;
        }
      }

      // Update article
      await this.articlesService?.patch(article.id, updateData);

      // Create a prompt record to track this edit
      if (this.promptsService) {
        await this.promptsService.create(
          new PromptEntity({
            articleId: String(
              (article as Record<string, unknown>).id ?? article.id,
            ),
            brandId: brandId,
            category: PromptCategory.ARTICLE,
            enhanced: JSON.stringify(response),
            isDeleted: false,
            isFavorite: false,
            isSkipEnhancement: false,
            organizationId: organizationId,
            original: prompt,
            scope: AssetScope.USER,
            status: PromptStatus.GENERATED,
            userId: userId,
          }),
        );
      }

      // Publish websocket event for article completion
      if (this.websocketService) {
        await this.websocketService.publishArticleStatus(
          article.id.toString(),
          'completed',
          userId,
          {
            content: updateData.content || article.content,
            label: updateData.label || article.label,
            slug: updateData.slug || article.slug,
            summary: updateData.summary || article.summary,
          },
        );
      }

      this.logger.log(`${this.constructorName} enhanced article with AI`, {
        articleId: article.id,
        prompt,
      });
    } catch (error: unknown) {
      this.logger.error('Failed to update article with enhanced content', {
        articleId: article.id,
        error: {
          message: (error as Error)?.message || 'Unknown error',
          stack: (error as Error)?.stack,
        },
      });
      await this.markArticleAsFailed(
        article,
        (error as Error)?.message || 'Failed to process enhanced content',
        userId,
      );
    }
  }

  /**
   * Mark article as failed during enhancement
   */
  private async markArticleAsFailed(
    article: ArticleDocument,
    errorMessage: string,
    userId: string,
  ): Promise<void> {
    await this.articlesService?.patch(
      ((article as Record<string, unknown>).id as string) ?? String(article.id),
      {
        aiGenerationCompletedAt: new Date(),
        aiGenerationError: errorMessage,
        status: ArticleStatus.DRAFT,
      } as unknown as Partial<UpdateArticleDto>,
    );

    // Publish websocket event for article failure
    if (this.websocketService) {
      await this.websocketService.publishArticleStatus(
        article.id.toString(),
        'failed',
        userId,
        {
          error: errorMessage,
        },
      );
    }

    this.logger.error('Article enhancement failed', {
      articleId: article.id,
      error: errorMessage,
    });
  }

  /**
   * Check if slug exists for the organization/brand
   */
  private async slugExists(
    slug: string,
    organizationId: string,
    brandId: string,
  ): Promise<boolean> {
    const existing = await this.articlesService?.findOne({
      brandId: brandId,
      isDeleted: false,
      organizationId: organizationId,
      slug,
    });

    return !!existing;
  }
}
