import { createEntityAttributes } from '@genfeedai/helpers';

export const postingCadenceAttributes = createEntityAttributes([
  'brief',
  'brandId',
  'credentialId',
  'endsAt',
  'format',
  'generateLanding',
  'intervalMinutes',
  'label',
  'maxOccurrences',
  'organizationId',
  'startsAt',
  'status',
  'timezone',
  'userId',
  'windowEndMinute',
  'windowStartMinute',
]);
