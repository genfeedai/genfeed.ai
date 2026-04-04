import { createEntityAttributes } from '@genfeedai/helpers';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';

export const videoAttributes = createEntityAttributes([
  ...ingredientAttributes,
  'text',
  'reference',
  'model',
  'style',
  'provider',
  'isBrandingEnabled',
  'isAudioEnabled',
  'duration',
  'language',
  'blacklist',
  'camera',
  'cameraMovement',
  'lens',
  'mood',
  'scene',
  'lighting',
  'width',
  'height',
  'seed',
  'resolution',
  'format',
  'fontFamily',
  'sounds',
  'speech',
  'endFrame',
  // Background music options
  'backgroundMusic',
  'musicVolume',
  'muteVideoAudio',
]);

export const videoEditAttributes = createEntityAttributes([
  'width',
  'height',
  'model',
  'text',
  'format',
  'prompt',
  'mood',
  'style',
  'camera',
  'scene',
  'targetFps',
  'targetResolution',
]);

export const videoCaptionAttributes = createEntityAttributes([
  'caption',
  'language',
  'format',
]);
