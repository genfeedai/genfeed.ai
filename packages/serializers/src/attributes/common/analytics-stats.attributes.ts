import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * Common paginated stats attributes used by both org and brand stats
 */
export const analyticsPaginatedStatsAttributes = createEntityAttributes([
  'data',
  'pagination',
]);

// Named aliases used by org/brand analytics serializers.
export const analyticsOrgStatsAttributes = analyticsPaginatedStatsAttributes;
export const analyticsBrandStatsAttributes = analyticsPaginatedStatsAttributes;
