import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';

/**
 * Utility to provide default values for query parameters based on BaseQueryDto
 */
export class QueryDefaultsUtil {
  private static readonly defaults = new BaseQueryDto();

  /**
   * Get default pagination options from BaseQueryDto
   */
  static getPaginationDefaults(query: Partial<BaseQueryDto> = {}) {
    // Normalize pagination to a boolean value before shaping query options.
    let paginationValue =
      query.pagination ?? QueryDefaultsUtil.defaults.pagination;

    // Convert string values to boolean if needed
    if (typeof paginationValue === 'string') {
      paginationValue = paginationValue !== 'false';
    }

    return {
      limit: query.limit ?? QueryDefaultsUtil.defaults.limit,
      page: query.page ?? QueryDefaultsUtil.defaults.page,
      pagination: paginationValue,
    };
  }

  /**
   * Get default isDeleted value from BaseQueryDto
   */
  static getIsDeletedDefault(value?: boolean): boolean {
    return value !== undefined
      ? Boolean(value)
      : Boolean(QueryDefaultsUtil.defaults.isDeleted);
  }

  /**
   * Get default sort value from BaseQueryDto
   */
  static getSortDefault(value?: string): string {
    return value ?? QueryDefaultsUtil.defaults.sort;
  }

  /**
   * Apply all defaults to a query object
   */
  static applyDefaults<T extends Partial<BaseQueryDto>>(
    query: T,
  ): T & BaseQueryDto {
    return {
      ...query,
      isDeleted: query.isDeleted ?? QueryDefaultsUtil.defaults.isDeleted,
      limit: query.limit ?? QueryDefaultsUtil.defaults.limit,
      page: query.page ?? QueryDefaultsUtil.defaults.page,
      pagination: query.pagination ?? QueryDefaultsUtil.defaults.pagination,
      sort: query.sort ?? QueryDefaultsUtil.defaults.sort,
    } as T & BaseQueryDto;
  }

  /**
   * Parse status filter to handle arrays and single values.
   * @param status - The status from query params (array or single value)
   * @returns query object for status filter, or undefined to omit the filter
   *
   * @example
   * // Single status
   * QueryDefaultsUtil.parseStatusFilter('completed') // returns 'completed'
   *
   * @example
   * // Array of statuses
   * QueryDefaultsUtil.parseStatusFilter(['processing', 'completed']) // returns { in: ['processing', 'completed'] }
   *
   * @example
   * // Empty/undefined status - returns default: draft, uploaded, completed
   * QueryDefaultsUtil.parseStatusFilter(undefined) // returns { in: ['draft', 'uploaded', 'completed'] }
   *
   * @example
   * // Empty string or whitespace - returns default
   * QueryDefaultsUtil.parseStatusFilter('') // returns { in: ['draft', 'uploaded', 'completed'] }
   *
   */
  static parseStatusFilter(status?: string | string[]): unknown {
    // Default to showing non-validated (draft, uploaded) + generated (completed) assets
    const DEFAULT_STATUSES = { in: ['draft', 'uploaded', 'completed'] };

    if (!status) {
      return DEFAULT_STATUSES;
    }

    // Handle array input
    if (Array.isArray(status)) {
      const statusArray = status.map((s) => String(s).trim()).filter(Boolean); // Remove empty strings
      return statusArray.length > 0 ? { in: statusArray } : DEFAULT_STATUSES;
    }

    const statusStr = String(status);

    if (statusStr.trim() === '') {
      return DEFAULT_STATUSES;
    }

    return statusStr.trim();
  }

  /**
   * Parse status filter for music ingredients, excluding failed by default.
   * @param status - The status from query params (array or single value)
   * @returns query object for status filter
   *
   * @example
   * // Single status
   * QueryDefaultsUtil.parseMusicStatusFilter('completed') // returns 'completed'
   *
   * @example
   * // Array of statuses
   * QueryDefaultsUtil.parseMusicStatusFilter(['processing', 'uploaded', 'completed', 'validated'])
   * // returns { in: ['processing', 'uploaded', 'completed', 'validated'] }
   *
   * @example
   * // Empty/undefined status - returns default: exclude failed
   * QueryDefaultsUtil.parseMusicStatusFilter(undefined) // returns { not: 'failed' }
   */
  static parseMusicStatusFilter(status?: string | string[]): unknown {
    // Default to excluding failed items
    if (!status) {
      return { not: 'failed' };
    }

    // Handle array input
    if (Array.isArray(status)) {
      const statusArray = status.map((s) => String(s).trim()).filter(Boolean); // Remove empty strings
      return statusArray.length > 0 ? { in: statusArray } : { not: 'failed' };
    }

    const statusStr = String(status);

    if (statusStr.trim() === '') {
      return { not: 'failed' };
    }

    return statusStr.trim();
  }

  /**
   * Parse boolean filter from query params, avoiding the Boolean('false') === true pitfall
   * @param value - The boolean value from query params (can be string or boolean)
   * @param defaultValue - Optional default query object when value is undefined
   * @returns Boolean value or query object
   *
   * @example
   * // Explicit true
   * QueryDefaultsUtil.parseBooleanFilter('true') // returns true
   * QueryDefaultsUtil.parseBooleanFilter(true) // returns true
   *
   * @example
   * // Explicit false (avoids Boolean('false') === true pitfall)
   * QueryDefaultsUtil.parseBooleanFilter('false') // returns false
   * QueryDefaultsUtil.parseBooleanFilter(false) // returns false
   *
   * @example
   * // Undefined with default
   * QueryDefaultsUtil.parseBooleanFilter(undefined, { not: null }) // returns { not: null }
   */
  static parseBooleanFilter(
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
}
