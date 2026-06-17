import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { ArticleStatus } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';

/**
 * Maps app-level ArticleStatus values (lowercase) to Prisma enum values (uppercase).
 * processing and failed are generation-pipeline states; they never persist to
 * Article.status and are excluded from persisted filters.
 */
export type PrismaArticleStatusValue = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

const APP_TO_PRISMA_STATUS: Partial<
  Record<ArticleStatus, PrismaArticleStatusValue>
> = {
  [ArticleStatus.DRAFT]: 'DRAFT',
  [ArticleStatus.PUBLIC]: 'PUBLISHED',
  [ArticleStatus.ARCHIVED]: 'ARCHIVED',
};

const PRISMA_ARTICLE_STATUS_VALUES = new Set<string>(
  Object.values(APP_TO_PRISMA_STATUS),
);

export class ArticleFilterUtil {
  static toPrismaArticleStatus(
    status?: ArticleStatus | PrismaArticleStatusValue | string,
  ): PrismaArticleStatusValue | undefined {
    if (status === undefined || status === '') {
      return undefined;
    }

    const mapped = APP_TO_PRISMA_STATUS[status as ArticleStatus];
    if (mapped !== undefined) {
      return mapped;
    }

    if (PRISMA_ARTICLE_STATUS_VALUES.has(status)) {
      return status as PrismaArticleStatusValue;
    }

    return undefined;
  }

  static toPersistedArticleStatus(
    status: ArticleStatus | PrismaArticleStatusValue | string,
  ): PrismaArticleStatusValue {
    const mapped = ArticleFilterUtil.toPrismaArticleStatus(status);
    if (mapped !== undefined) {
      return mapped;
    }

    throw new BadRequestException(
      `ArticleStatus "${status}" cannot be persisted to Article.status`,
    );
  }

  static buildPublicArticleStatusFilter(): {
    status: PrismaArticleStatusValue;
  } {
    return {
      status: ArticleFilterUtil.toPersistedArticleStatus(ArticleStatus.PUBLIC),
    };
  }

  static isPublicArticleStatus(status: unknown): boolean {
    return (
      ArticleFilterUtil.toPrismaArticleStatus(String(status)) === 'PUBLISHED'
    );
  }

  static toArticlePersistenceData<T extends Record<string, unknown>>(
    data: T,
  ): T {
    if (data.status === undefined) {
      return data;
    }

    return {
      ...data,
      status: ArticleFilterUtil.toPersistedArticleStatus(String(data.status)),
    };
  }

  static buildArticleStatusFilter(
    status?:
      | ArticleStatus
      | PrismaArticleStatusValue
      | Array<ArticleStatus | PrismaArticleStatusValue>,
  ): Record<string, unknown> {
    if (!status) return {};

    const statuses = Array.isArray(status) ? status : [status];
    const mapped = statuses
      .map((s) => ArticleFilterUtil.toPrismaArticleStatus(s))
      .filter((s): s is PrismaArticleStatusValue => s !== undefined);

    if (mapped.length === 0) return {};
    if (mapped.length === 1) {
      return { status: mapped[0] };
    }

    return { status: { in: mapped } };
  }

  static buildCategoryFilter(category?: string): Record<string, unknown> {
    return category ? { category } : {};
  }

  static buildTagFilter(tagId?: string): Record<string, unknown> {
    return tagId && isEntityId(tagId) ? { tags: { some: { id: tagId } } } : {};
  }

  static buildContentSearchFilter(search?: string): Record<string, unknown> {
    if (!search?.trim()) return {};

    const searchFilter = { contains: search.trim(), mode: 'insensitive' };
    return {
      OR: [
        { title: searchFilter },
        { excerpt: searchFilter },
        { content: searchFilter },
      ],
    };
  }

  static buildTagPopulation(): Record<string, unknown> {
    return { include: { tags: true } };
  }

  static buildArticlequery(
    query: {
      status?: ArticleStatus | ArticleStatus[];
      category?: string;
      tag?: string;
      scope?: string;
      search?: string;
      sortBy?: string;
      sortDirection?: 'asc' | 'desc';
      sortOrder?: 'asc' | 'desc';
    },
    baseMatch: Record<string, unknown>,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {
      ...baseMatch,
      ...ArticleFilterUtil.buildTagFilter(query.tag),
      ...ArticleFilterUtil.buildArticleStatusFilter(query.status),
      ...ArticleFilterUtil.buildCategoryFilter(query.category),
    };

    const searchFilter = ArticleFilterUtil.buildContentSearchFilter(
      query.search,
    );
    if (Object.keys(searchFilter).length > 0) {
      where.AND = [searchFilter];
    }

    if (query.scope !== undefined) {
      where.scope = query.scope;
    }

    const sortBy = query.sortBy || 'createdAt';
    const sortDirection = query.sortDirection || query.sortOrder || 'desc';

    return {
      include: ArticleFilterUtil.buildTagPopulation().include,
      orderBy: { [sortBy]: sortDirection === 'asc' ? 1 : -1 },
      where,
    };
  }
}
