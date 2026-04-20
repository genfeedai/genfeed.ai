const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;
function isValidObjectId(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_REGEX.test(id);
}

type PipelineStage = Record<string, unknown>;

/**
 * BaseFilterUtil - Utility for building common aggregation pipeline filters
 *
 * Provides reusable filter builders that are shared across different collections:
 * - Array $in filters
 * - Boolean parsing (isFeatured, isActive)
 * - Base match building
 * - Search filters
 * - Lookup pipeline building
 *
 * @example
 * // Build array filter
 * const industryFilter = BaseFilterUtil.buildArrayInFilter('industries', ['tech', 'finance']);
 *
 * // Parse boolean filter
 * const isFeatured = BaseFilterUtil.parseBooleanFilter(query.isFeatured);
 *
 * // Build search filter
 * const searchStages = BaseFilterUtil.buildSearchFilter('marketing', ['label', 'description']);
 */
export class BaseFilterUtil {
  /**
   * Build array $in filter for pipeline
   *
   * Creates $in filter for array fields (industries, platforms, categories, etc.).
   * Returns pipeline stage or empty array.
   *
   * @param field - Field name to filter
   * @param values - Single value or array of values
   * @returns Array of pipeline stages (empty if no values)
   *
   * @example
   * // Single value
   * BaseFilterUtil.buildArrayInFilter('industries', 'technology')
   * // Returns: [{ $match: { industries: { $in: ['technology'] } } }]
   *
   * @example
   * // Multiple values
   * BaseFilterUtil.buildArrayInFilter('platforms', ['instagram', 'tiktok'])
   * // Returns: [{ $match: { platforms: { $in: ['instagram', 'tiktok'] } } }]
   */
  static buildArrayInFilter(
    field: string,
    values?: string | string[],
  ): PipelineStage[] {
    if (!values) {
      return [];
    }

    const arrayValues = Array.isArray(values) ? values : [values];

    if (arrayValues.length === 0) {
      return [];
    }

    return [
      {
        $match: {
          [field]: { $in: arrayValues },
        },
      },
    ];
  }

  /**
   * Parse boolean filter (handles string 'true'/'false' from query params)
   *
   * Correctly handles boolean query params, avoiding Boolean('false') === true pitfall.
   *
   * @param value - Boolean value from query params (string or boolean)
   * @returns Boolean value or undefined
   *
   * @example
   * // String 'true'
   * BaseFilterUtil.parseBooleanFilter('true') // Returns: true
   *
   * // String 'false' (avoids Boolean('false') === true)
   * BaseFilterUtil.parseBooleanFilter('false') // Returns: false
   *
   * // Boolean value
   * BaseFilterUtil.parseBooleanFilter(true) // Returns: true
   */
  static parseBooleanFilter(value?: string | boolean): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    // Handle string values - avoid Boolean('false') === true pitfall
    if (typeof value === 'string') {
      return value !== 'false' && value !== '0' && value !== '';
    }

    return Boolean(value);
  }

  /**
   * Build search filter across multiple fields
   *
   * Creates case-insensitive regex search across specified fields.
   *
   * @param search - Search query string
   * @param fields - Fields to search across
   * @returns Array of pipeline stages (empty if no search)
   *
   * @example
   * BaseFilterUtil.buildSearchFilter('marketing', ['label', 'description', 'content'])
   * // Returns: [{ $match: { $or: [
   * //   { label: { $regex: 'marketing', $options: 'i' } },
   * //   { description: { $regex: 'marketing', $options: 'i' } },
   * //   { content: { $regex: 'marketing', $options: 'i' } }
   * // ] } }]
   */
  static buildSearchFilter(
    search?: string,
    fields: string[] = ['label', 'description'],
  ): PipelineStage[] {
    if (!search || search.trim() === '') {
      return [];
    }

    const searchRegex = { $options: 'i', $regex: search.trim() };
    const orConditions = fields.map((field) => ({ [field]: searchRegex }));

    return [
      {
        $match: {
          $or: orConditions,
        },
      },
    ];
  }

  /**
   * Build ObjectId filter from string ID
   *
   * Safely converts string ID to ObjectId for filtering.
   *
   * @param field - Field name to filter
   * @param id - String ID value
   * @returns Filter object or empty object if invalid
   *
   * @example
   * BaseFilterUtil.buildObjectIdFilter('tags', '507f1f77bcf86cd799439011')
   * // Returns: { tags: ObjectId('507f1f77bcf86cd799439011') }
   */
  static buildObjectIdFilter(
    field: string,
    id?: string,
  ): Record<string, unknown> {
    if (!id || !isValidObjectId(id)) {
      return {};
    }

    return { [field]: id };
  }

  /**
   * Build sort stage
   *
   * Creates standard sort pipeline stage.
   *
   * @param sortBy - Field to sort by
   * @param sortDirection - Sort direction ('asc' or 'desc')
   * @returns Pipeline stage for sorting
   *
   * @example
   * BaseFilterUtil.buildSortStage('createdAt', 'desc')
   * // Returns: { $sort: { createdAt: -1 } }
   */
  static buildSortStage(
    sortBy: string = 'createdAt',
    sortDirection: 'asc' | 'desc' = 'desc',
  ): PipelineStage {
    return {
      $sort: { [sortBy]: sortDirection === 'asc' ? 1 : -1 },
    };
  }

  /**
   * Build single-value lookup stage
   *
   * Creates lookup + unwind for single related document.
   *
   * @param from - Collection to join
   * @param localField - Local field for join
   * @param foreignField - Foreign field for join
   * @param as - Output field name
   * @returns Array of pipeline stages (lookup + unwind)
   *
   * @example
   * BaseFilterUtil.buildSingleLookup('brands', 'brand', '_id', 'brand')
   */
  static buildSingleLookup(
    from: string,
    localField: string,
    foreignField: string,
    as: string,
  ): PipelineStage[] {
    return [
      {
        $lookup: {
          as,
          foreignField,
          from,
          localField,
        },
      },
      {
        $unwind: {
          path: `$${as}`,
          preserveNullAndEmptyArrays: true,
        },
      },
    ];
  }

  /**
   * Build conditional lookup with match expressions
   *
   * Creates lookup with $expr for complex join conditions.
   *
   * @param from - Collection to join
   * @param let - Variables from local document
   * @param pipeline - Pipeline stages for the lookup
   * @param as - Output field name
   * @returns Pipeline stage
   *
   * @example
   * BaseFilterUtil.buildConditionalLookup(
   *   'assets',
   *   { brandId: '$_id' },
   *   [{ $match: { $expr: { $and: [
   *     { $eq: ['$parent', '$$brandId'] },
   *     { $eq: ['$isDeleted', false] }
   *   ] } } }],
   *   'assets'
   * )
   */
  static buildConditionalLookup(
    from: string,
    letVars: Record<string, unknown>,
    pipeline: PipelineStage[],
    as: string,
  ): PipelineStage {
    return {
      $lookup: {
        as,
        from,
        let: letVars,
        pipeline,
      },
    };
  }

  /**
   * Build three-tier scope OR conditions (global, org, user)
   *
   * Presets/templates often have three tiers of scope.
   * This builds $or conditions for all accessible items.
   *
   * @param publicMetadata - User metadata with organization and user IDs
   * @returns Array of OR conditions
   *
   * @example
   * BaseFilterUtil.buildScopeOrConditions({ organization: '123', user: '456' })
   * // Returns: [
   * //   { organization: { $exists: false }, user: { $exists: false } },
   * //   { organization: ObjectId('123') },
   * //   { user: ObjectId('456') }
   * // ]
   */
  static buildScopeOrConditions(publicMetadata: {
    organization?: string;
    user?: string;
  }): Record<string, unknown>[] {
    const orConditions: Record<string, unknown>[] = [
      { organization: { $exists: false }, user: { $exists: false } }, // global items
    ];

    if (publicMetadata.organization) {
      orConditions.push({
        organization: publicMetadata.organization,
      });
    }

    if (publicMetadata.user) {
      orConditions.push({
        user: publicMetadata.user,
      });
    }

    return orConditions;
  }

  /**
   * Normalize array values (convert single value to array)
   *
   * @param value - Single value or array
   * @returns Array of values
   *
   * @example
   * BaseFilterUtil.normalizeToArray('tech') // Returns: ['tech']
   * BaseFilterUtil.normalizeToArray(['tech', 'finance']) // Returns: ['tech', 'finance']
   */
  static normalizeToArray<T>(value?: T | T[]): T[] {
    if (!value) {
      return [];
    }
    return Array.isArray(value) ? value : [value];
  }
}
