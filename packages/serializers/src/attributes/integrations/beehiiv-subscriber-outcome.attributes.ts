import { createEntityAttributes } from '@genfeedai/helpers';

export const beehiivSubscriberOutcomeAttributes = createEntityAttributes([
  'email',
  'errorCode',
  'errorMessage',
  'isRetryable',
  'status',
  'subscriberId',
  'success',
]);
