import { createEntityAttributes } from '@genfeedai/helpers';

export const avatarTwinAttributes = createEntityAttributes([
  'name',
  'status',
  'providerGroupId',
  'providerLookId',
  'supportedEngines',
  'previewImageUrl',
  'voiceId',
  'consentLinkExpiresAt',
  'failureCode',
  'failureMessage',
  'readyAt',
]);
