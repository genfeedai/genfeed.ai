import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetScope } from '@genfeedai/enums';

/**
 * CollectionFilterUtil - Utility for building consistent collection query filters
 *
 * Eliminates duplicate filter logic across collection controllers (articles, posts, templates, etc.)
 * Provides reusable filter builders for common collection query patterns.
 *
 * @example
 * // Build brand filter with fallback
 * const brand = CollectionFilterUtil.buildBrandFilter(query.brand, publicMetadata);
 *
 * // Build scope filter
 * const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
 *
 * // Build search filter
 * const searchStages = CollectionFilterUtil.buildSearchFilter(query.search, ['metadata.label', 'metadata.description']);
 *
 * // Use in findAll query
 * const aggregate: Record<string, unknown>[] = [
 *   { match: { brand, scope, status, ...ownershipFilter } },
 *   ...searchStages,
 *   { orderBy: { ... } }
 * ];
 */
export class CollectionFilterUtil {
  /**
   * Build admin filter for superadmin org/brand filtering
   *
   * When a superadmin passes explicit organization/brand query params,
   * returns a filter object scoped to that org/brand. Returns null if
   * the user is not a superadmin or no org/brand params are provided,
   * signaling the caller should use the normal ownership filter.
   *
   * @param publicMetadata - User metadata (must include isSuperAdmin)
   * @param query - Query params with optional organization/brand
   * @returns Filter object or null if not applicable
   *
   * @example
   * const adminFilter = CollectionFilterUtil.buildAdminFilter(publicMetadata, query);
   * if (adminFilter) {
   *   // Use adminFilter instead of normal ownership filter
   * }
   */
  static buildAdminFilter(
    publicMetadata: { isSuperAdmin?: boolean },
    query: {
      organization?: string;
      brand?: string;
    },
  ): Record<string, unknown> | null {
    if (!publicMetadata.isSuperAdmin) {
      return null;
    }

    const hasOrg = query.organization && isEntityId(query.organization);
    const hasBrand = query.brand && isEntityId(query.brand);

    if (!hasOrg && !hasBrand) {
      return null;
    }

    const filter: Record<string, unknown> = {};

    if (hasOrg) {
      filter.organization = String(query.organization);
    }

    if (hasBrand) {
      filter.brand = String(query.brand);
    }

    return filter;
  }

  /**
   * Build brand filter with fallback logic
   *
   * Handles filtering by brand ID with fallback to user's brand:
   * - valid ObjectId → specific brand
   * - undefined with publicMetadata → user's brand
   * - undefined without publicMetadata → any brand exists
   *
   * @param brand - Brand ID from query params
   * @param publicMetadata - User metadata containing brand fallback
   * @param defaultTo - Default behavior: 'user' | 'exists' | 'none'
   * @returns Filter value for brand field
   *
   * @example
   * // Specific brand
   * CollectionFilterUtil.buildBrandFilter('507f1f77bcf86cd799439011', publicMetadata)
   * // Returns: ObjectId('507f1f77bcf86cd799439011')
   *
   * @example
   * // Fallback to user's brand
   * CollectionFilterUtil.buildBrandFilter(undefined, publicMetadata, 'user')
   * // Returns: ObjectId(publicMetadata.brand)
   *
   * @example
   * // Any brand exists
   * CollectionFilterUtil.buildBrandFilter(undefined, publicMetadata, 'exists')
   * // Returns: { not: true }
   */
  static buildBrandFilter(
    brand: unknown,
    publicMetadata?: { brand?: string },
    defaultTo: 'user' | 'exists' | 'none' = 'user',
  ): string | Record<string, unknown> {
    if (isEntityId(brand)) {
      return String(brand);
    }

    // Handle default behavior based on defaultTo parameter
    switch (defaultTo) {
      case 'user':
        return publicMetadata?.brand ? publicMetadata.brand : { not: true };

      case 'exists':
        return { not: true };

      case 'none':
        return { not: null };

      default:
        return { not: true };
    }
  }

  /**
   * Build scope filter with defaults
   *
   * Handles filtering by asset scope (public/private/organization):
   * - specific scope → that scope value
   * - undefined → any scope (not null)
   *
   * @param scope - Scope from query params
   * @returns Filter value for scope field
   *
   * @example
   * // Specific scope
   * CollectionFilterUtil.buildScopeFilter(AssetScope.PUBLIC)
   * // Returns: 'public'
   *
   * @example
   * // Default - any scope
   * CollectionFilterUtil.buildScopeFilter(undefined)
   * // Returns: { not: null }
   */
  static buildScopeFilter(
    scope?: AssetScope,
  ): AssetScope | Record<string, unknown> {
    return scope ? scope : { not: null };
  }

  /**
   * Build search filter across multiple fields
   *
   * Creates case-insensitive regex search across specified fields.
   * Returns query fragments with match using OR for multiple fields.
   *
   * @param search - Search query string
   * @param fields - Array of field paths to search
   * @returns Array of query fragments (empty if no search)
   *
   * @example
   * // Search across metadata fields
   * CollectionFilterUtil.buildSearchFilter('hello', ['metadata.label', 'metadata.description'])
   * // Returns: [{ match: { OR: [{ 'metadata.label': { contains: 'hello', mode: 'insensitive' } }, ...] } }]
   *
   * @example
   * // No search
   * CollectionFilterUtil.buildSearchFilter(undefined, ['label'])
   * // Returns: []
   */
  static buildSearchFilter(
    search?: string,
    fields: string[] = ['metadata.label', 'metadata.description'],
  ): Record<string, unknown>[] {
    if (!search || search.trim() === '') {
      return { where: {} };
    }

    const searchRegex = { mode: 'insensitive', contains: search.trim() };
    const orConditions = fields.map((field) => ({ [field]: searchRegex }));

    return {
      where: {
        OR: orConditions,
      },
    };
  }

  /**
   * Build ownership filter for user/organization
   *
   * Creates filter to match documents owned by user or organization.
   * Useful for multi-tenant collections.
   *
   * @param publicMetadata - User metadata with user/organization IDs
   * @param options - Configuration for ownership filter
   * @returns Filter object with ownership conditions
   *
   * @example
   * // User or organization ownership
   * CollectionFilterUtil.buildOwnershipFilter(publicMetadata)
   * // Returns: { OR: [{ user: ObjectId(...) }, { organization: ObjectId(...) }] }
   *
   * @example
   * // User only
   * CollectionFilterUtil.buildOwnershipFilter(publicMetadata, { includeOrganization: false })
   * // Returns: { user: ObjectId(...) }
   */
  static buildOwnershipFilter(
    publicMetadata: { user?: string; organization?: string },
    options: {
      includeOrganization?: boolean;
      includeUser?: boolean;
      fieldNames?: { user?: string; organization?: string };
    } = {},
  ): Record<string, unknown> {
    const {
      includeOrganization = true,
      includeUser = true,
      fieldNames = { organization: 'organization', user: 'user' },
    } = options;

    const conditions: Record<string, unknown>[] = [];

    if (includeUser && publicMetadata.user) {
      conditions.push({
        [fieldNames.user!]: publicMetadata.user,
      });
    }

    if (includeOrganization && publicMetadata.organization) {
      conditions.push({
        [fieldNames.organization!]: publicMetadata.organization,
      });
    }

    // If only one condition, return it directly
    if (conditions.length === 1) {
      return conditions[0];
    }

    // If multiple conditions, use OR
    if (conditions.length > 1) {
      return { OR: conditions };
    }

    // Fallback if no conditions
    return {};
  }

  /**
   * Build date range filter
   *
   * Creates filter for documents within a date range.
   * Useful for analytics, evaluations, and time-based queries.
   *
   * @param startDate - Start date (ISO string or Date)
   * @param endDate - End date (ISO string or Date)
   * @param field - Field name to filter (default: 'createdAt')
   * @returns Filter object with date range, or empty object
   *
   * @example
   * // Date range filter
   * CollectionFilterUtil.buildDateRangeFilter('2024-01-01', '2024-12-31')
   * // Returns: { createdAt: { gte: Date(...), lte: Date(...) } }
   *
   * @example
   * // Custom field
   * CollectionFilterUtil.buildDateRangeFilter('2024-01-01', '2024-12-31', 'publishedAt')
   * // Returns: { publishedAt: { gte: Date(...), lte: Date(...) } }
   *
   * @example
   * // No dates
   * CollectionFilterUtil.buildDateRangeFilter(undefined, undefined)
   * // Returns: {}
   */
  static buildDateRangeFilter(
    startDate?: string | Date,
    endDate?: string | Date,
    field: string = 'createdAt',
  ): Record<string, unknown> {
    if (!startDate && !endDate) {
      return {};
    }

    const filter: Record<string, Date> = {};

    if (startDate) {
      filter.gte = new Date(startDate);
    }

    if (endDate) {
      filter.lte = new Date(endDate);
    }

    return { [field]: filter };
  }

  /**
   * Build array filter for multi-value fields
   *
   * Creates filter for array fields (tags, industries, platforms, etc.).
   * Handles both single values and arrays.
   *
   * @param values - Single value or array of values
   * @param field - Field name to filter
   * @param matchAll - If true, match every value; if false, match any value.
   * @returns Filter object for array field, or empty object
   *
   * @example
   * // Single value
   * CollectionFilterUtil.buildArrayFilter('technology', 'industries')
   * // Returns: { industries: { in: ['technology'] } }
   *
   * @example
   * // Multiple values (match any)
   * CollectionFilterUtil.buildArrayFilter(['tech', 'finance'], 'industries')
   * // Returns: { industries: { in: ['tech', 'finance'] } }
   *
   * @example
   * // Multiple values (match all)
   * CollectionFilterUtil.buildArrayFilter(['tag1', 'tag2'], 'tags', true)
   * // Returns: { tags: { hasEvery: ['tag1', 'tag2'] } }
   */
  static buildArrayFilter(
    values?: string | string[],
    field: string = 'tags',
    matchAll: boolean = false,
  ): Record<string, unknown> {
    if (!values) {
      return {};
    }

    const arrayValues = Array.isArray(values) ? values : [values];

    if (arrayValues.length === 0) {
      return {};
    }

    const operator = matchAll ? 'hasEvery' : 'in';
    return { [field]: { [operator]: arrayValues } };
  }

  /**
   * Build status filter condition
   *
   * Handles filtering by status:
   * - array of statuses → use in operator
   * - single value → simple equality
   * - undefined → no filter (all statuses)
   *
   * @param status - Status value(s) from query params (array or single value)
   * @returns Filter condition for status field or empty object
   *
   * @example
   * // Single status
   * CollectionFilterUtil.buildStatusFilter('completed')
   * // Returns: { status: 'completed' }
   *
   * @example
   * // Array of statuses
   * CollectionFilterUtil.buildStatusFilter(['completed', 'processing', 'validated'])
   * // Returns: { status: { in: ['completed', 'processing', 'validated'] } }
   *
   * @example
   * // No filter
   * CollectionFilterUtil.buildStatusFilter(undefined)
   * // Returns: {}
   */
  static buildStatusFilter(
    status?: string | string[],
  ): Record<string, unknown> {
    if (!status) {
      return {};
    }

    // Handle array input
    if (Array.isArray(status)) {
      const statusArray = status.map((s) => String(s).trim()).filter(Boolean);
      return statusArray.length === 1
        ? { status: statusArray[0] }
        : { status: { in: statusArray } };
    }

    return { status: String(status).trim() };
  }

  /**
   * Build category filter
   *
   * Creates filter for category field (enum values).
   * Handles single or multiple categories.
   *
   * @param category - Category value or array of values
   * @returns Filter object for category field, or empty object
   *
   * @example
   * // Single category
   * CollectionFilterUtil.buildCategoryFilter('video')
   * // Returns: { category: 'video' }
   *
   * @example
   * // Multiple categories
   * CollectionFilterUtil.buildCategoryFilter(['image', 'video'])
   * // Returns: { category: { in: ['image', 'video'] } }
   */
  static buildCategoryFilter(
    category?: string | string[],
  ): Record<string, unknown> {
    if (!category) {
      return {};
    }

    if (Array.isArray(category)) {
      return category.length > 0 ? { category: { in: category } } : {};
    }

    return { category };
  }

  /**
   * Conditional query fragments
   *
   * Returns query fragments conditionally based on a boolean flag.
   * Useful for lightweight queries that skip expensive lookups.
   *
   * @param condition - Whether to include stages
   * @param stages - query stages to conditionally include
   * @returns Array of stages (or empty array if condition is false)
   *
   * @example
   * // Skip expensive lookups in lightweight mode
   * ...CollectionFilterUtil.conditionalStages(!query.lightweight, [
   *   { relationInclude: { from: 'votes', ... } },
   *   { relationInclude: { from: 'children', ... } }
   * ])
   */
  static conditionalStages(
    condition: boolean,
    stages: Record<string, unknown>[],
  ): Record<string, unknown>[] {
    return condition ? stages : [];
  }

  /**
   * Build boolean filter with proper string handling
   *
   * Parses boolean query params correctly, avoiding Boolean('false') === true pitfall.
   * Delegates to QueryDefaultsUtil.parseBooleanFilter.
   *
   * @param value - Boolean value from query params (can be string or boolean)
   * @param defaultValue - Default query object when undefined
   * @returns Boolean value or query object
   *
   * @example
   * // Explicit true
   * CollectionFilterUtil.buildBooleanFilter('true')
   * // Returns: true
   *
   * @example
   * // Explicit false (avoids Boolean('false') === true pitfall)
   * CollectionFilterUtil.buildBooleanFilter('false')
   * // Returns: false
   *
   * @example
   * // Undefined with default
   * CollectionFilterUtil.buildBooleanFilter(undefined, { not: null })
   * // Returns: { not: null }
   */
  static buildBooleanFilter(
    value?: string | boolean,
    defaultValue: Record<string, unknown> = { not: null },
  ): boolean | Record<string, unknown> {
    if (value === undefined) {
      return defaultValue;
    }

    // Handle string values - avoid Boolean('false') === true pitfall
    if (typeof value === 'string') {
      return value !== 'false' && value !== '0' && value !== '';
    }

    // Handle boolean values
    return Boolean(value);
  }

  /**
   * Build sort object from query string
   *
   * Converts sort query param to sort object.
   * Supports multiple sort fields and directions.
   *
   * @param sort - Sort string from query params (e.g., '-createdAt', 'label,createdAt')
   * @param defaultSort - Default sort object
   * @returns sort object
   *
   * @example
   * // Descending sort
   * CollectionFilterUtil.buildSortObject('-createdAt')
   * // Returns: { createdAt: -1 }
   *
   * @example
   * // Multiple fields
   * CollectionFilterUtil.buildSortObject('label,-createdAt')
   * // Returns: { label: 1, createdAt: -1 }
   *
   * @example
   * // Default
   * CollectionFilterUtil.buildSortObject(undefined, { createdAt: -1 })
   * // Returns: { createdAt: -1 }
   */
  static buildSortObject(
    sort?: string,
    defaultSort: Record<string, 1 | -1> = { createdAt: -1 },
  ): Record<string, 1 | -1> {
    if (!sort) {
      return defaultSort;
    }

    const sortObject: Record<string, 1 | -1> = {};
    const fields = sort.split(',');

    for (const field of fields) {
      const trimmed = field.trim();
      if (trimmed.startsWith('-')) {
        sortObject[trimmed.substring(1)] = -1;
      } else {
        sortObject[trimmed] = 1;
      }
    }

    return Object.keys(sortObject).length > 0 ? sortObject : defaultSort;
  }

  /**
   * Build pagination options
   *
   * Creates pagination options for paginated list responses.
   * Includes custom labels for consistency.
   *
   * @param query - Query params with pagination options
   * @param customLabels - Custom labels for pagination response
   * @returns Pagination options object
   *
   * @example
   * CollectionFilterUtil.buildPaginationOptions(query, customLabels)
   * // Returns: { page: 1, limit: 50, pagination: true, customLabels: {...} }
   */
  static buildPaginationOptions(
    query: { page?: number; limit?: number; pagination?: boolean | string },
    customLabels?: Record<string, string>,
  ): Record<string, unknown> {
    // Ensure pagination is a boolean value
    let paginationValue = query.pagination ?? true;
    if (typeof paginationValue === 'string') {
      paginationValue = paginationValue !== 'false';
    }

    return {
      limit: query.limit ?? 50,
      page: query.page ?? 1,
      pagination: paginationValue,
      ...(customLabels && { customLabels }),
    };
  }
}
