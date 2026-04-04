import { createEntityAttributes } from '@genfeedai/helpers';
import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';

export const voiceAttributes = createEntityAttributes([
  ...ingredientAttributes,
  'externalVoiceId',
  'cloneStatus',
  'sampleAudioUrl',
  'isCloned',
  'isActive',
  'isDefaultSelectable',
  'providerData',
  'isFeatured',
  'voiceSource',
  'provider',
  'voiceId',
  'language',
  'gender',
  'accent',
  'speed',
  'pitch',
  'volume',
]);
