import { createEntityAttributes } from '@genfeedai/helpers';

export const unitEconomicsReportAttributes = createEntityAttributes([
  'from',
  'to',
  'organizationId',
  'organizationLabel',
  'rows',
  'totals',
]);
