import { Types } from 'mongoose';

const OBJECT_ID_FIELDS = new Set([
  '_id',
  'id',
  'user',
  'brand',
  'organization',
  'parent',
  'metadata',
  'asset',
  'credential',
  'activity',
  'ingredient',
  'room',
]);

function normalizeMongoFilterValue(field: string, value: unknown): unknown {
  if (typeof value === 'string' && OBJECT_ID_FIELDS.has(field)) {
    return Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : value;
  }

  return value;
}

/**
 * QueryBuilder - Utility for building MongoDB queries with common patterns
 *
 * Eliminates duplicate query building code across services
 *
 * @example
 * const query = new QueryBuilder(organizationId)
 *   .addFilter('contentType', filters.contentType)
 *   .addInFilter('categories', filters.categories)
 *   .addTextSearch(filters.search)
 *   .addDateRange('createdAt', filters.startDate, filters.endDate)
 *   .build();
 */
export class QueryBuilder {
  private query: Record<string, unknown> = {};

  constructor(organization?: string | Types.ObjectId) {
    this.query = {
      isDeleted: false,
    };
    // Only add organization filter if provided
    // If undefined, query will match both org-specific and global templates
    if (organization != null) {
      this.query.organization = normalizeMongoFilterValue(
        'organization',
        organization,
      );
    }
  }

  /**
   * Add a simple filter (only if value is defined)
   */
  addFilter(field: string, value: unknown): this {
    if (value != null && value !== '') {
      this.query[field] = normalizeMongoFilterValue(field, value);
    }
    return this;
  }

  /**
   * Add an $in filter for arrays (only if array has items)
   */
  addInFilter(field: string, values?: unknown[]): this {
    if (values && values.length > 0) {
      this.query[field] = {
        $in: values.map((value) => normalizeMongoFilterValue(field, value)),
      };
    }
    return this;
  }

  /**
   * Add a text search filter
   */
  addTextSearch(searchTerm?: string): this {
    if (searchTerm) {
      this.query.$text = { $search: searchTerm };
    }
    return this;
  }

  /**
   * Add a date range filter
   */
  addDateRange(field: string, startDate?: Date, endDate?: Date): this {
    if (startDate || endDate) {
      const range: { $gte?: Date; $lte?: Date } = {};
      if (startDate) {
        range.$gte = startDate;
      }
      if (endDate) {
        range.$lte = endDate;
      }
      this.query[field] = range;
    }
    return this;
  }

  /**
   * Add a boolean filter
   */
  addBooleanFilter(field: string, value?: boolean): this {
    if (value !== undefined) {
      this.query[field] = value;
    }
    return this;
  }

  /**
   * Add a regex filter for partial matching
   */
  addRegexFilter(field: string, pattern: string, options: string = 'i'): this {
    if (pattern) {
      this.query[field] = { $options: options, $regex: pattern };
    }
    return this;
  }

  /**
   * Add a custom query condition
   */
  addCustom(field: string, condition: unknown): this {
    this.query[field] = condition;
    return this;
  }

  /**
   * Remove a field from the query
   */
  remove(field: string): this {
    delete this.query[field];
    return this;
  }

  /**
   * Get the built query object
   */
  build(): Record<string, unknown> {
    return this.query;
  }

  /**
   * Get a copy of the current query
   */
  clone(): QueryBuilder {
    const organization = this.query.organization;
    const builder = new QueryBuilder(
      typeof organization === 'string' || organization instanceof Types.ObjectId
        ? organization
        : undefined,
    );
    builder.query = { ...this.query };
    return builder;
  }

  /**
   * Reset the query to base state
   */
  reset(): this {
    const org = this.query.organization;
    this.query = {
      isDeleted: false,
    };
    if (org !== undefined) {
      this.query.organization = org;
    }
    return this;
  }
}
