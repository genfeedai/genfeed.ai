import { createEntityAttributes } from '@genfeedai/helpers';

export const heygenServiceAttributes = createEntityAttributes([
  'provider',
  'apiKey',
  'metadata',
]);

export const heygenVoiceAttributes = createEntityAttributes([
  'voiceId',
  'name',
  'gender',
  'preview',
  'provider',
  'index',
]);

export const heygenAvatarAttributes = createEntityAttributes([
  'avatarId',
  'name',
  'gender',
  'preview',
  'provider',
  'index',
]);
