import { createEntityAttributes } from '@genfeedai/helpers';

export const emailPerformanceAttributes = createEntityAttributes([
  'from',
  'to',
  'asOf',
  'rows',
]);
