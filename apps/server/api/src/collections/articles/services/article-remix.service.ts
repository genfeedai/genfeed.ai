import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ArticleCategory, ArticleScope, ArticleStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

type ArticleFinder = (
  criteria: Record<string, unknown>,
) => Promise<ArticleDocument | null>;
type ArticleCreator = (
  dto: CreateArticleDto,
  userId: string,
  organizationId: string,
  brandId: string,
) => Promise<ArticleDocument>;

@Injectable()
export class ArticleRemixService {
  constructor(private readonly logger: LoggerService) {}

  async createRemix(
    originalArticleId: string,
    userId: string,
    organizationId: string,
    brandId: string,
    options: { label?: string } | undefined,
    findArticle: ArticleFinder,
    createArticle: ArticleCreator,
  ): Promise<ArticleDocument> {
    const url = CallerUtil.getCallerName();
    const originalArticle = await findArticle({
      id: originalArticleId,
      OR: [{ userId }, { organizationId }],
      isDeleted: false,
    });
    if (!originalArticle) {
      throw new NotFoundException('Original article', originalArticleId);
    }

    this.logger.log(`${url} creating remix`, {
      originalArticleId,
      originalTitle: originalArticle.label,
    });

    const remixTitle =
      options?.label || `Remix: ${originalArticle.label || 'Untitled'}`;
    const baseSlug = originalArticle.slug || 'article';
    const remixSlug = `${baseSlug}-remix-${Date.now()}`;
    const remixDto: CreateArticleDto = {
      category:
        this.normalizeArticleCategory(originalArticle.category) ??
        ArticleCategory.POST,
      content: this.readString(originalArticle.content),
      label: remixTitle,
      scope:
        this.normalizeArticleScope(originalArticle.scope) ?? ArticleScope.USER,
      slug: remixSlug,
      status: ArticleStatus.DRAFT,
      summary: this.readString(originalArticle.summary) ?? '',
      tags: this.readStringArray(originalArticle.tags),
    };

    const remixArticle = await createArticle(
      remixDto,
      userId,
      organizationId,
      brandId,
    );
    this.logger.log(`${url} remix created`, {
      originalArticleId,
      remixArticleId: remixArticle.id,
    });
    return remixArticle;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private readStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private normalizeArticleCategory(
    value: unknown,
  ): ArticleCategory | undefined {
    return Object.values(ArticleCategory).find(
      (category) => category === value,
    );
  }

  private normalizeArticleScope(value: unknown): ArticleScope | undefined {
    return Object.values(ArticleScope).find((scope) => scope === value);
  }
}
