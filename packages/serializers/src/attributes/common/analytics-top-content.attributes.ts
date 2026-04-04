import { createEntityAttributes } from '@genfeedai/helpers';

export const analyticsTopContentAttributes = createEntityAttributes([
  'postId',
  'ingredientId',
  'title',
  'description',
  'platform',
  'views',
  'likes',
  'comments',
  'shares',
  'engagementRate',
  'publishDate',
  'url',
]);
