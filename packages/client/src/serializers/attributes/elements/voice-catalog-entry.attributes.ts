import { createEntityAttributes } from '@genfeedai/helpers';

export const voiceCatalogEntryAttributes = createEntityAttributes([
  'provider',
  'externalVoiceId',
  'name',
  'preview',
  'isDefaultSelectable',
  'providerData',
]);
