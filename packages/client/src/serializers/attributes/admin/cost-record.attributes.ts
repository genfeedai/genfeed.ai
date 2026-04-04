import { createEntityAttributes } from '@genfeedai/helpers';

export const costRecordAttributes = createEntityAttributes([
  'amount',
  'category',
  'currency',
  'date',
  'description',
  'isRecurring',
  'organization',
  'vendor',
]);
