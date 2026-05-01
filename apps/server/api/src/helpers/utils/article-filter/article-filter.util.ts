import { ArticleStatus } from '@genfeedai/enums';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

export class ArticleFilterUtil {
  static buildArticleStatusFilter(
    status?: ArticleStatus | ArticleStatus[],
  ): Record<string, unknown> {
    if (!status) return {};

    const statuses = Array.isArray(status) ? status : [status];
    const expandedStatuses = new Set<ArticleStatus>();

    for (const item of statuses) {
      if (item === ArticleStatus.DRAFT) {
        expandedStatuses.add(ArticleStatus.DRAFT);
        expandedStatuses.add(ArticleStatus.PROCESSING);
      } else {
        expandedStatuses.add(item);
      }
    }

    if (expandedStatuses.size === 0) return {};
    if (expandedStatuses.size === 1) {
      return { status: Array.from(expandedStatuses)[0] };
    }

    return { status: { in: Array.from(expandedStatuses) } };
  }

  static buildCategoryFilter(category?: string): Record<string, unknown> {
    return category ? { category } : {};
  }

  static buildTagFilter(tagId?: string): Record<string, unknown> {
    return tagId && isValidObjectId(tagId) ? { tags: tagId } : {};
  }

  static buildContentSearchFilter(search?: string): Record<string, unknown> {
    if (!search?.trim()) return {};

    const searchFilter = { contains: search.trim(), mode: 'insensitive' };
    return {
      OR: [
        { label: searchFilter },
        { summary: searchFilter },
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
