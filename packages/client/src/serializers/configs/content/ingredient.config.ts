import { ingredientAttributes } from '../../attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '../../attributes/ingredients/metadata.attributes';
import { rel, simpleConfig } from '../../builders';
import { CONTENT_ENTITY_RELS } from '../../relationships';

export const ingredientSerializerConfig = {
  attributes: ingredientAttributes,
  type: 'ingredient',
  ...CONTENT_ENTITY_RELS,
  metadata: rel('metadata', metadataAttributes),
  prompt: rel('prompt', ['original', 'enhanced']),
};

export const ingredientBulkDeleteSerializerConfig = simpleConfig(
  'ingredient-bulk-delete',
  ['category', 'ids'],
);

export const ingredientUploadSerializerConfig = simpleConfig(
  'ingredient-upload',
  [
    'organization',
    'brand',
    'category',
    'source',
    'sourceType',
    'createdAt',
    'updatedAt',
  ],
);

export const ingredientMergeSerializerConfig = simpleConfig(
  'ingredient-merge',
  [
    'category',
    'ids',
    'voice',
    'music',
    'isCaptionsEnabled',
    'transition',
    'transitionDuration',
    'transitionEaseCurve',
    'zoomEaseCurve',
    'zoomConfigs',
    'isMuteVideoAudio',
    'musicVolume',
  ],
);
