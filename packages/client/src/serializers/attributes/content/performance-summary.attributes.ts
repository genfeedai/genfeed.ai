import { createEntityAttributes } from '@genfeedai/helpers';

export const performanceSummaryAttributes = createEntityAttributes([
  'topPerformers',
  'worstPerformers',
  'avgEngagementByPlatform',
  'avgEngagementByContentType',
  'bestPostingTimes',
  'topHooks',
  'weekOverWeekTrend',
]);
