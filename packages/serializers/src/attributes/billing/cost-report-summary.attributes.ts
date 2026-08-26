import { createEntityAttributes } from '@genfeedai/helpers';

export const costReportSummaryAttributes = createEntityAttributes([
  'from',
  'to',
  'total',
  'byBrand',
  'daily',
]);
