import { createEntityAttributes } from '@genfeedai/helpers';

export const analyticsPlatformAttributes = createEntityAttributes([
  'platform',
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
  'engagementRate',
  'postCount',
  'avgViewsPerPost',
]);
