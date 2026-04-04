import { createEntityAttributes } from '@genfeedai/helpers';

export const analyticsBrandLeaderboardAttributes = createEntityAttributes([
  'name',
  'logo',
  'organizationId',
  'organizationName',
  'totalPosts',
  'totalEngagement',
  'totalViews',
  'avgEngagementRate',
  'growth',
  'activePlatforms',
]);
