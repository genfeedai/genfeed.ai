import { createEntityAttributes } from '@genfeedai/helpers';

/** Serialized fields of `IPlatformComparison` (`@genfeedai/contracts`). */
export const analyticsPlatformAttributes = createEntityAttributes([
  'platform',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'totalEngagement',
  'engagementRate',
  'postCount',
  'avgViewsPerPost',
]);
