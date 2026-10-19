import { createEntityAttributes } from '@genfeedai/helpers';

export const economicsRevenueReportAttributes = createEntityAttributes([
  'from',
  'to',
  'daily',
  'sources',
  'topOrganizations',
  'latestEvents',
  'latestEventsLimit',
  'ledgerStartedAt',
  'nonUsdEvents',
  'totals',
]);
