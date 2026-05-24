/**
 * TemplateFilterUtil - Utility for building template-specific query filters
 *
 * Provides reusable filter builders for template query patterns.
 * Handles template-specific logic like array-based filters (industries, platforms, categories).
 *
 * @example
 * // Build template filters object
 * const filters = TemplateFilterUtil.buildTemplateFilters(query);
 *
 * // Build array filter
 * const arrayFilter = TemplateFilterUtil.buildArrayInFilter('industries', query.industry);
 *
 * // Parse featured filter
 * const isFeatured = TemplateFilterUtil.parseFeaturedFilter(query.isFeatured);
 */
export class TemplateFilterUtil {
  /**
   * Build template filters object from query
   *
   * Converts query DTO to filters object suitable for service layer.
   * Handles single-to-array conversions for array-based filters.
   *
   * @param query - Query DTO with filter parameters
   * @returns Filters object for service layer
   *
   * @example
   * // Basic filters
   * TemplateFilterUtil.buildTemplateFilters({
   *   purpose: 'prompt',
   *   category: 'video',
   *   industry: 'technology',
   *   isFeatured: 'true'
   * })
   * // Returns: {
   * //   purpose: 'prompt',
   * //   category: 'video',
   * //   industries: ['technology'],
   * //   isFeatured: true
   * // }
   *
   * @example
   * // Multiple industries
   * TemplateFilterUtil.buildTemplateFilters({
   *   industries: ['technology', 'finance']
   * })
   * // Returns: { industries: ['technology', 'finance'] }
   */
  static buildTemplateFilters(
    query: {
      purpose?: 'content' | 'prompt';
      key?: string;
      category?: string;
      categories?: string | string[];
      industry?: string;
      industries?: string | string[];
      platform?: string;
      platforms?: string | string[];
      scope?: string;
      isFeatured?: string | boolean;
      search?: string;
    } = {},
  ): Record<string, unknown> {
    const filters: Record<string, unknown> = {};

    // Purpose filter (content/prompt)
    if (query.purpose) {
      filters.purpose = query.purpose;
    }

    // Key filter (for prompt templates)
    if (query.key) {
      filters.key = query.key;
    }

    // Category filter (single)
    if (query.category) {
      filters.category = query.category;
    }

    // Categories filter (array)
    if (query.categories) {
      filters.categories = Array.isArray(query.categories)
        ? query.categories
        : [query.categories];
    }

    // Industries filter (array)
    // Single industry from query.industry OR multiple from query.industries
    if (query.industry) {
      filters.industries = [query.industry];
    } else if (query.industries) {
      filters.industries = Array.isArray(query.industries)
        ? query.industries
        : [query.industries];
    }

    // Platforms filter (array)
    // Single platform from query.platform OR multiple from query.platforms
    if (query.platform) {
      filters.platforms = [query.platform];
    } else if (query.platforms) {
      filters.platforms = Array.isArray(query.platforms)
        ? query.platforms
        : [query.platforms];
    }

    // Scope filter
    if (query.scope) {
      filters.scope = query.scope;
    }

    // isFeatured boolean filter
    if (query.isFeatured !== undefined) {
      filters.isFeatured = TemplateFilterUtil.parseFeaturedFilter(
        query.isFeatured,
      );
    }

    // Search filter
    if (query.search) {
      filters.search = query.search;
    }

    return filters;
  }

  /**
   * Build array membership filter.
   *
   * Creates in filter for array fields (industries, platforms, categories, etc.).
   * @param field - Field name to filter
   * @param values - Single value or array of values
   * @returns Prisma where fragment.
   */
  static buildArrayInFilter(
    field: string,
    values?: string | string[],
  ): Record<string, unknown> {
    if (!values) {
      return {};
    }

    const arrayValues = Array.isArray(values) ? values : [values];

    if (arrayValues.length === 0) {
      return {};
    }

    return { [field]: { in: arrayValues } };
  }

  /**
   * Parse featured filter (boolean string handling)
   *
   * Correctly handles boolean query params, avoiding Boolean('false') === true pitfall.
   *
   * @param value - Featured value from query params (string or boolean)
   * @returns Boolean value or undefined
   *
   * @example
   * // String 'true'
   * TemplateFilterUtil.parseFeaturedFilter('true')
   * // Returns: true
   *
   * @example
   * // String 'false' (avoids Boolean('false') === true)
   * TemplateFilterUtil.parseFeaturedFilter('false')
   * // Returns: false
   *
   * @example
   * // Boolean value
   * TemplateFilterUtil.parseFeaturedFilter(true)
   * // Returns: true
   *
   * @example
   * // Undefined
   * TemplateFilterUtil.parseFeaturedFilter(undefined)
   * // Returns: undefined
   */
  static parseFeaturedFilter(value?: string | boolean): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }

    // Handle string values - avoid Boolean('false') === true pitfall
    if (typeof value === 'string') {
      return value !== 'false' && value !== '0' && value !== '';
    }

    // Handle boolean values
    return Boolean(value);
  }

  /**
   * Build purpose filter for prompt templates
   *
   * Creates filter specifically for prompt templates (purpose: 'prompt').
   *
   * @param purpose - Purpose value ('content' or 'prompt')
   * @returns Filter object or empty object
   *
   * @example
   * // Prompt templates
   * TemplateFilterUtil.buildPurposeFilter('prompt')
   * // Returns: { purpose: 'prompt' }
   *
   * @example
   * // Content templates
   * TemplateFilterUtil.buildPurposeFilter('content')
   * // Returns: { purpose: 'content' }
   *
   * @example
   * // No filter
   * TemplateFilterUtil.buildPurposeFilter(undefined)
   * // Returns: {}
   */
  static buildPurposeFilter(
    purpose?: 'content' | 'prompt',
  ): Record<string, unknown> {
    if (!purpose) {
      return {};
    }

    return { purpose };
  }

  /**
   * Build key filter for prompt templates
   *
   * Creates filter for template key (unique identifier for prompt templates).
   *
   * @param key - Template key
   * @returns Filter object or empty object
   *
   * @example
   * // With key
   * TemplateFilterUtil.buildKeyFilter('system-prompt')
   * // Returns: { key: 'system-prompt' }
   *
   * @example
   * // No key
   * TemplateFilterUtil.buildKeyFilter(undefined)
   * // Returns: {}
   */
  static buildKeyFilter(key?: string): Record<string, unknown> {
    if (!key) {
      return {};
    }

    return { key };
  }
}
