import { createEntityAttributes } from '@genfeedai/helpers';

export const liveSessionAttributes = createEntityAttributes([
  'organizationId',
  'brandId',
  'userId',
  'modelKey',
  'resolution',
  'ceilingSeconds',
  'reservedCredits',
  'reservationId',
  'startedAt',
  'ceilingEndsAt',
  'terminatedAt',
  'elapsedSeconds',
  'settledCredits',
  'terminateReason',
  'status',
  'isByokBypass',
]);
