import { createEntityAttributes } from '@genfeedai/helpers';
import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';

export const voiceCloneAttributes = createEntityAttributes([
  ...ingredientAttributes,
  'provider',
  'voiceId',
  'externalVoiceId',
  'cloneStatus',
  'sampleAudioUrl',
  'isCloned',
  'language',
  'gender',
]);
