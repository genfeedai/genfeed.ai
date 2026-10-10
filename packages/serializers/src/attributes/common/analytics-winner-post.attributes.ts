import { createEntityAttributes } from '@genfeedai/helpers';

/**
 * #5502 `GET /analytics/winners`: own posts that beat their account baseline
 * on at least one signal, with the evidence that qualified them.
 */
export const analyticsWinnerPostAttributes = createEntityAttributes([
  'postId',
  'label',
  'description',
  'platform',
  'contentType',
  'publishedAt',
  'totalViews',
  'totalLikes',
  'totalComments',
  'engagementRate',
  'evidence',
]);
