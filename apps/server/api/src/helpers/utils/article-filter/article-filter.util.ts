import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { ArticleStatus } from '@genfeedai/enums';

/**
 * Maps app-level ArticleStatus values (lowercase) to Prisma enum values (uppercase).
 * processing and failed have no Prisma equivalent and are excluded from the filter.
 */
const APP_TO_PRISMA_STATUS: Partial<Record<ArticleStatus, string>> = {
  [ArticleStatus.DRAFT]: 'DRAFT',
  [ArticleStatus.PUBLIC]: 'PUBLISHED',
  [ArticleStatus.ARCHIVED]: 'ARCHIVED',
};

export class ArticleFilterUtil {
  static buildArticleStatusFilter(
    status?: ArticleStatus | ArticleStatus[],
  ): Record<string, unknown> {
    if (!status) return {};

    const statuses = Array.isArray(status) ? status : [status];
    const mapped = statuses
      .map((s) => APP_TO_PRISMA_STATUS[s])
      .filter((s): s is string => s !== undefined);

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
