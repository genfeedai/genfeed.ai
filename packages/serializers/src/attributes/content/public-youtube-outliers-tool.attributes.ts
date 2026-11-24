import { createEntityAttributes } from '@genfeedai/helpers';

export const publicYoutubeOutliersToolAttributes = createEntityAttributes([
  'baselineSampleSize',
  'baselineViews',
  'breakoutThreshold',
  'channelId',
  'channelTitle',
  'outlierThreshold',
  'outliers',
  'status',
  'videosAnalyzed',
]);
