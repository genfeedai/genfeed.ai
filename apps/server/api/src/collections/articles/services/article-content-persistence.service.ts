import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import type { PersistGeneratedArticleParams } from '@api/collections/articles/services/articles-content.types';
import type { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { ArticleStatus, TagCategory } from '@genfeedai/enums';
import type { ArticleCreatePayload } from '@genfeedai/interfaces/content/article.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';

@Injectable()
export class ArticleContentPersistenceService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly logger: LoggerService,
    @Optional() private readonly tagsService?: TagsService,
  ) {}

  /**
   * Resolve AI-generated tag labels into Tag ids so createArticle can connect
   * them (#2870 dropped generated tags because labels are not ids). Tag has no
   * unique label constraint, so this is an org-scoped find-or-create by label.
   * Best-effort: a tag failure must never fail article creation.
   */
  private async resolveGeneratedTagIds(params: {
    brandId: string;
    labels: string[] | undefined;
    organizationId: string;
    userId: string;
  }): Promise<string[]> {
    if (!this.tagsService || !params.labels?.length) {
      return [];
    }

    const labels = [
      ...new Set(params.labels.map((label) => label.trim()).filter(Boolean)),
    ];
    const ids: string[] = [];

    for (const label of labels) {
      try {
        const existing = await this.tagsService.findOne({
          isDeleted: false,
          label: { equals: label, mode: 'insensitive' },
          organizationId: params.organizationId,
        });

        if (existing) {
          ids.push(existing.id);
          continue;
        }

        const created = await this.tagsService.create({
          brandId: params.brandId,
          category: TagCategory.ARTICLE,
          label,
          organizationId: params.organizationId,
          userId: params.userId,
        } as unknown as CreateTagDto);
        ids.push(created.id);
      } catch (error: unknown) {
        this.logger.warn(
          `${this.constructorName} failed to resolve generated tag`,
          { error, label },
        );
      }
    }

    return ids;
  }

  async persistGeneratedArticle(
    params: PersistGeneratedArticleParams,
  ): Promise<ArticleDocument> {
    const tagIds = await this.resolveGeneratedTagIds({
      brandId: params.brandId,
      labels: params.tagLabels,
      organizationId: params.organizationId,
      userId: params.userId,
    });
    const articlePayload: ArticleCreatePayload = {
      category: params.category,
      content: params.draft.content,
      label: params.draft.label,
      slug: params.slug,
      status: ArticleStatus.DRAFT,
      summary: params.draft.summary,
      ...(tagIds.length > 0 ? { tags: tagIds } : {}),
    };

    return params.createArticleFn(
      articlePayload,
      params.userId,
      params.organizationId,
      params.brandId,
    );
  }
}
