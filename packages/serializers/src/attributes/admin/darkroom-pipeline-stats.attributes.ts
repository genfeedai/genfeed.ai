import { createEntityAttributes } from '@genfeedai/helpers';

export const darkroomPipelineStatsAttributes = createEntityAttributes([
  'assetsGenerated',
  'assetsPendingReview',
  'assetsPublished',
  'trainingsActive',
]);
