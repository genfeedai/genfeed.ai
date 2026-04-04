import { createEntityAttributes } from '@genfeedai/helpers';

export const analyticsOrgLeaderboardAttributes = createEntityAttributes([
  'rank',
  'organization',
  'totalPosts',
  'totalEngagement',
  'totalViews',
  'avgEngagementRate',
  'growth',
]);
