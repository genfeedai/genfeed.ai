/**
 * QueryBuilder - Utility for building Prisma where-clause objects with common patterns.
 *
 * Eliminates duplicate query building code across services.
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

  constructor(organizationId?: string) {
    this.query = {
      isDeleted: false,
    };
    // Only add organizationId filter if provided.
    // If undefined, query will match both org-specific and global templates.
    if (organizationId != null) {
      this.query.organizationId = organizationId;
    }
  }

  /**
   * Add a simple filter (only if value is defined)
   */
  addFilter(field: string, value: unknown): this {
    if (value != null && value !== '') {
      this.query[field] = value;
    }
    return this;
  }

  /**
   * Add an `in` filter for arrays (only if array has items)
   */
  addInFilter(field: string, values?: unknown[]): this {
    if (values && values.length > 0) {
      this.query[field] = { in: values };
    }
    return this;
  }

  /**
   * Add a text search filter using Prisma `contains` (case-insensitive).
   * Note: requires a text-searchable string field. Defaults to searching a `content` field.
   * Override with `addCustom` for model-specific text search needs.
   */
  addTextSearch(searchTerm?: string, field: string = 'content'): this {
    if (searchTerm) {
      this.query[field] = { contains: searchTerm, mode: 'insensitive' };
    }
    return this;
  }

  /**
   * Add a date range filter using Prisma `gte`/`lte`.
   */
  addDateRange(field: string, startDate?: Date, endDate?: Date): this {
    if (startDate || endDate) {
      const range: { gte?: Date; lte?: Date } = {};
      if (startDate) {
        range.gte = startDate;
      }
      if (endDate) {
        range.lte = endDate;
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
   * Add a regex/contains filter for partial matching (case-insensitive)
   */
  addRegexFilter(field: string, pattern: string): this {
    if (pattern) {
      this.query[field] = { contains: pattern, mode: 'insensitive' };
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
    const orgId =
      typeof this.query.organizationId === 'string'
        ? this.query.organizationId
        : undefined;
    const builder = new QueryBuilder(orgId);
    builder.query = { ...this.query };
    return builder;
  }

  /**
   * Reset the query to base state
   */
  reset(): this {
    const org = this.query.organizationId;
    this.query = {
      isDeleted: false,
    };
    if (org !== undefined) {
      this.query.organizationId = org;
    }
    return this;
  }
}
