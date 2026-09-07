import { createEntityAttributes } from '@genfeedai/helpers';

export const performanceSummaryAttributes = createEntityAttributes([
  'dataset',
  'topPerformers',
  'worstPerformers',
  'avgEngagementByPlatform',
  'avgEngagementByContentType',
  'bestPostingTimes',
  'topHooks',
  'weekOverWeekTrend',
]);
