import { ArticleStatus } from '@genfeedai/enums';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

/**
 * ArticleFilterUtil - Utility for building article-specific query filters
 *
 * Provides reusable filter builders for article query patterns that differ from standard collections.
 * Handles article-specific logic like DRAFT status including PROCESSING.
 *
 * @example
 * // Build article status filter with DRAFT special handling
 * const statusStages = ArticleFilterUtil.buildArticleStatusFilter(query.status);
 *
 * // Build tag filter
 * const tagFilter = ArticleFilterUtil.buildTagFilter(query.tag);
 *
 * // Build content search filter
 * const searchStages = ArticleFilterUtil.buildContentSearchFilter(query.search);
 *
 * // Use in aggregation pipeline
 * const pipeline: Record<string, unknown>[] = [
 *   { $match: { ...baseMatch, ...tagFilter } },
 *   ...statusStages,
 *   ...searchStages,
 * ];
 */
export class ArticleFilterUtil {
  /**
   * Build article status filter with DRAFT special handling
   *
   * Handles article status filtering:
   * - DRAFT → includes both DRAFT and PROCESSING statuses
   * - Other statuses → exact match or $in for arrays
   * - undefined → no filter (all statuses)
   *
   * @param status - Article status(es) from query params (single or array)
   * @returns Array of pipeline stages (empty if no status)
   *
   * @example
   * // DRAFT includes PROCESSING
   * ArticleFilterUtil.buildArticleStatusFilter(ArticleStatus.DRAFT)
   * // Returns: [{ $match: { status: { $in: [ArticleStatus.DRAFT, ArticleStatus.PROCESSING] } } }]
   *
   * @example
   * // Array of statuses
   * ArticleFilterUtil.buildArticleStatusFilter([ArticleStatus.DRAFT, ArticleStatus.PUBLIC])
   * // Returns: [{ $match: { status: { $in: [ArticleStatus.DRAFT, ArticleStatus.PROCESSING, ArticleStatus.PUBLIC] } } }]
   *
   * @example
   * // Other statuses - exact match
   * ArticleFilterUtil.buildArticleStatusFilter(ArticleStatus.PUBLIC)
   * // Returns: [{ $match: { status: ArticleStatus.PUBLIC } }]
   *
   * @example
   * // No status filter
   * ArticleFilterUtil.buildArticleStatusFilter(undefined)
   * // Returns: []
   */
  static buildArticleStatusFilter(
    status?: ArticleStatus | ArticleStatus[],
  ): Record<string, unknown>[] {
    if (!status) {
      return [];
    }

    const statuses = Array.isArray(status) ? status : [status];
    const expandedStatuses = new Set<ArticleStatus>();

    for (const s of statuses) {
      if (s === ArticleStatus.DRAFT) {
        expandedStatuses.add(ArticleStatus.DRAFT);
        expandedStatuses.add(ArticleStatus.PROCESSING);
      } else {
        expandedStatuses.add(s);
      }
    }

    if (expandedStatuses.size === 0) {
      return [];
    }

    if (expandedStatuses.size === 1) {
      return [
        {
          $match: { status: Array.from(expandedStatuses)[0] },
        },
      ];
    }

    return [
      {
        $match: { status: { $in: Array.from(expandedStatuses) } },
      },
    ];
  }

  /**
   * Build category filter
   *
   * Creates filter for article category field.
   *
   * @param category - Category value from query params
   * @returns Array of pipeline stages (empty if no category)
   *
   * @example
   * // Category filter
   * ArticleFilterUtil.buildCategoryFilter('blog')
   * // Returns: [{ $match: { category: 'blog' } }]
   *
   * @example
   * // No category filter
   * ArticleFilterUtil.buildCategoryFilter(undefined)
   * // Returns: []
   */
  static buildCategoryFilter(category?: string): Record<string, unknown>[] {
    if (!category) {
      return [];
    }

    return [
      {
        $match: { category },
      },
    ];
  }

  /**
   * Build tag filter
   *
   * Creates filter for articles with specific tag.
   * Handles ObjectId conversion.
   *
   * @param tagId - Tag ID from query params
   * @returns Filter object for tags field (empty if invalid)
   *
   * @example
   * // Valid tag ID
   * ArticleFilterUtil.buildTagFilter('507f1f77bcf86cd799439011')
   * // Returns: { tags: ObjectId('507f1f77bcf86cd799439011') }
   *
   * @example
   * // Invalid or missing tag ID
   * ArticleFilterUtil.buildTagFilter(undefined)
   * // Returns: {}
   */
  static buildTagFilter(tagId?: string): Record<string, unknown> {
    if (!tagId || !isValidObjectId(tagId)) {
      return {};
    }

    return { tags: tagId };
  }

  /**
   * Build content search filter
   *
   * Creates case-insensitive regex search across article content fields:
   * - label (title)
   * - summary (description)
   * - content (full article body)
   *
   * @param search - Search query string
   * @returns Array of pipeline stages (empty if no search)
   *
   * @example
   * // Search across content
   * ArticleFilterUtil.buildContentSearchFilter('marketing')
   * // Returns: [{ $match: { $or: [
   * //   { label: { $regex: 'marketing', $options: 'i' } },
   * //   { summary: { $regex: 'marketing', $options: 'i' } },
   * //   { content: { $regex: 'marketing', $options: 'i' } }
   * // ] } }]
   *
   * @example
   * // No search
   * ArticleFilterUtil.buildContentSearchFilter(undefined)
   * // Returns: []
   */
  static buildContentSearchFilter(search?: string): Record<string, unknown>[] {
    if (!search || search.trim() === '') {
      return [];
    }

    const searchRegex = { $options: 'i', $regex: search.trim() };

    return [
      {
        $match: {
          $or: [
            { label: searchRegex },
            { summary: searchRegex },
            { content: searchRegex },
          ],
        },
      },
    ];
  }

  /**
   * Build tag population lookup
   *
   * Populates article tags with specific fields projection.
   * Returns standardized tag lookup stages.
   *
   * @param includeFields - Additional fields to include beyond standard (_id, label, backgroundColor, textColor)
   * @returns Array of pipeline stages for tag lookup
   *
   * @example
   * // Standard tag population
   * ArticleFilterUtil.buildTagPopulation()
   * // Returns: [{ $lookup: { from: 'tags', ... } }]
   *
   * @example
   * // With additional fields
   * ArticleFilterUtil.buildTagPopulation(['description', 'slug'])
   * // Returns: [{ $lookup: { from: 'tags', pipeline: [{ $project: { ..., description: 1, slug: 1 } }] } }]
   */
  static buildTagPopulation(
    includeFields: string[] = [],
  ): Record<string, unknown>[] {
    const projection: Record<string, number> = {
      _id: 1,
      backgroundColor: 1,
      label: 1,
      textColor: 1,
    };

    // Add any additional fields
    for (const field of includeFields) {
      projection[field] = 1;
    }

    return [
      {
        $lookup: {
          as: 'tags',
          foreignField: '_id',
          from: 'tags',
          localField: 'tags',
          pipeline: [
            {
              $project: projection,
            },
          ],
        },
      },
    ];
  }

  /**
   * Build complete article filter pipeline
   *
   * Combines all article-specific filters into a complete pipeline.
   * Useful for article listing endpoints.
   *
   * @param query - Query params containing filter values
   * @param baseMatch - Base match conditions (user, organization, brand, isDeleted)
   * @returns Complete array of pipeline stages
   *
   * @example
   * const pipeline = ArticleFilterUtil.buildArticlePipeline(query, {
   *   user: ObjectId(...),
   *   organization: ObjectId(...),
   *   brand: ObjectId(...),
   *   isDeleted: false
   * });
   */
  static buildArticlePipeline(
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
  ): Record<string, unknown>[] {
    const tagFilter = ArticleFilterUtil.buildTagFilter(query.tag);

    const pipeline: Record<string, unknown>[] = [
      {
        $match: {
          ...baseMatch,
          ...tagFilter,
        },
      },
    ];

    // Add search filter
    pipeline.push(...ArticleFilterUtil.buildContentSearchFilter(query.search));

    // Add status filter
    pipeline.push(...ArticleFilterUtil.buildArticleStatusFilter(query.status));

    // Add category filter
    pipeline.push(...ArticleFilterUtil.buildCategoryFilter(query.category));

    // Add scope filter
    if (query.scope !== undefined) {
      pipeline.push({
        $match: { scope: query.scope },
      });
    }

    // Add tag population
    pipeline.push(...ArticleFilterUtil.buildTagPopulation());

    // Add sorting
    const sortBy = query.sortBy || 'createdAt';
    const sortDirection = query.sortDirection || query.sortOrder || 'desc';
    pipeline.push({
      $sort: { [sortBy]: sortDirection === 'asc' ? 1 : -1 },
    });

    return pipeline;
  }
}
