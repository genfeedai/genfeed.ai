import { createEntityAttributes } from '@genfeedai/helpers';

export const avatarTwinAttributes = createEntityAttributes([
  'name',
  'status',
  'brandId',
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
