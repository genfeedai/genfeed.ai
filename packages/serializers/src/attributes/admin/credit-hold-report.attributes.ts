import { createEntityAttributes } from '@genfeedai/helpers';
export const creditHoldReportAttributes = createEntityAttributes([
  'organizationId',
  'retrievedAt',
  'rows',
  'nextCursor',
]);
