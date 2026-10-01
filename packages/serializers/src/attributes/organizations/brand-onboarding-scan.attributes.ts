import { createEntityAttributes } from '@genfeedai/helpers';

export const brandOnboardingScanAttributes = createEntityAttributes([
  'brandId',
  'status',
  'url',
  'startedAt',
  'completedAt',
  'revisionId',
  'errorCode',
]);
