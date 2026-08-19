import { createEntityAttributes } from '@genfeedai/helpers';

export const calendarSlotAttributes = createEntityAttributes([
  'brandId',
  'cadenceId',
  'credentialId',
  'format',
  'generatedItemId',
  'generatedItemType',
  'identityKey',
  'instant',
  'lastFailureReason',
  'resolvedBrief',
  'state',
  'timezone',
]);
