/**
 * Generic Prisma-style where query.
 */
export interface PrismaWhereQuery<T = unknown> {
  [key: string]: T;
}

/**
 * Prisma pagination options.
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
