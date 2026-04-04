import { createEntityAttributes } from '@genfeedai/helpers';

export const analyticsOverviewAttributes = createEntityAttributes([
  'totalPosts',
  'totalViews',
  'totalEngagement',
  'avgEngagementRate',
  'organizationCount',
  'brandCount',
  'growth',
]);
