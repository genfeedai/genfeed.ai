import { createEntityAttributes } from '@genfeedai/helpers';

export const economicsOverviewReportAttributes = createEntityAttributes([
  'from',
  'to',
  'previousFrom',
  'previousTo',
  'totals',
  'previousTotals',
  'daily',
]);
