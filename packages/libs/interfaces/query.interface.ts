/**
 * Generic MongoDB match query for aggregation pipelines
 * Used in $match stage of aggregation
 */
export interface MongoMatchQuery<T = unknown> {
  [key: string]: T;
}

/**
 * MongoDB aggregation pagination options
 */
export interface AggregationOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
  /** Allow additional pagination options */
  [key: string]: unknown;
}

/**
 * Public API filter for querying collections
 * Common filters used across public endpoints
 */
export interface PublicApiFilter {
  isDeleted?: boolean;
  isActive?: boolean;
  organizationId?: string;
  userId?: string;
  /** Allow additional filter fields */
  [key: string]: unknown;
}
