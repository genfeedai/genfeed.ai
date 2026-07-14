import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

type ArticleFinder = (
  criteria: Record<string, unknown>,
) => Promise<ArticleDocument | null>;

type ArticlePatcher = (
  articleId: string,
  updates: {
    content?: string;
    label?: string;
    summary?: string;
  },
) => Promise<unknown>;

@Injectable()
export class ArticleVersionService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly logger: LoggerService,
    @Optional() private readonly promptsService?: PromptsService,
  ) {}

  async getArticleVersions(
    articleId: string,
    userId: string,
    organizationId: string,
    brandId: string,
    findArticle: ArticleFinder,
  ): Promise<{
    articleId: string;
    totalVersions: number;
    prompts: unknown[];
  }> {
    try {
      const article = await findArticle({
        id: articleId,
        OR: [{ userId }, { organizationId }],
        isDeleted: false,
      });

      if (!article) {
        throw new NotFoundException('Article');
      }

      if (!this.promptsService) {
        return {
          articleId: article.id,
          prompts: [],
          totalVersions: 0,
        };
      }

      const promptsResult = await this.promptsService.findAll(
        { where: {} },
        { pagination: false },
      );
      const prompts = promptsResult.docs.filter(
        (prompt: Record<string, unknown>) =>
          prompt.articleId === articleId &&
          prompt.brandId === brandId &&
          prompt.organizationId === organizationId &&
          prompt.userId === userId,
      );

      return {
        articleId: article.id,
        prompts: prompts.map(
          (prompt: Record<string, unknown>, index: number) => ({
            id: prompt.id,
            prompt: prompt.original,
            result: prompt.enhanced,
            version: index + 1,
          }),
        ),
        totalVersions: prompts.length,
      };
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} getArticleVersions failed`, {
        articleId,
        error,
      });
      throw error;
    }
  }

  async restoreArticleVersion(
    articleId: string,
    promptId: string,
    userId: string,
    organizationId: string,
    findArticle: ArticleFinder,
    patchArticle: ArticlePatcher,
  ): Promise<ArticleDocument> {
    try {
      const article = await findArticle({
        id: articleId,
        OR: [{ userId }, { organizationId }],
        isDeleted: false,
      });

      if (!article) {
        throw new NotFoundException('Article');
      }

      if (!this.promptsService) {
        throw new Error('Prompts service not available');
      }

      const prompt = await this.promptsService.findOne({
        id: promptId,
        articleId,
        isDeleted: false,
        userId,
      });

      if (!prompt) {
        throw new NotFoundException('Version');
      }

      if (!prompt.enhanced || typeof prompt.enhanced !== 'string') {
        throw new NotFoundException(
          'Version data is missing or invalid - cannot restore',
        );
      }

      let versionData: { content?: string; title?: string; summary?: string };
      try {
        versionData = JSON.parse(prompt.enhanced) as {
          content?: string;
          title?: string;
          summary?: string;
        };
      } catch (parseError) {
        this.logger.error('Failed to parse version data', {
          articleId,
          parseError,
          promptId,
        });

        throw new NotFoundException(
          'Version data is corrupted - cannot restore',
        );
      }

      await patchArticle(articleId, {
        content: versionData.content,
        label: versionData.title,
        summary: versionData.summary,
      });

      this.logger.log(`${this.constructorName} restored article to prompt`, {
        articleId,
        promptId,
      });

      const updatedArticle = await findArticle({
        id: articleId,
        OR: [{ userId }, { organizationId }],
        isDeleted: false,
      });

      if (!updatedArticle) {
        throw new NotFoundException('Article');
      }

      return updatedArticle;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} restoreArticleVersion failed`,
        { articleId, error, promptId },
      );
      throw error;
    }
  }
}
