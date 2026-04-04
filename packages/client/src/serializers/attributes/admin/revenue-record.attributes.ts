import { createEntityAttributes } from '@genfeedai/helpers';

export const revenueRecordAttributes = createEntityAttributes([
  'amount',
  'currency',
  'date',
  'description',
  'isRecurring',
  'lead',
  'organization',
  'source',
]);
