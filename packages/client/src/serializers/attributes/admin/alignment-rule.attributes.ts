import { createEntityAttributes } from '@genfeedai/helpers';

export const alignmentRuleAttributes = createEntityAttributes([
  'definition',
  'effectiveDate',
  'key',
  'label',
  'lastReviewedAt',
  'notes',
  'organization',
  'owner',
  'status',
]);
