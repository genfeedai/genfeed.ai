import { createEntityAttributes } from '@genfeedai/helpers';

export const fleetPipelineStatsAttributes = createEntityAttributes([
  'assetsGenerated',
  'assetsPendingReview',
  'assetsPublished',
  'trainingsActive',
]);
