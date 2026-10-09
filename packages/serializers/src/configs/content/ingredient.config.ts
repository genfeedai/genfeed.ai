import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { rel, simpleConfig } from '@serializers/builders';
import { serializeAgentWorkObject } from '@serializers/helpers/agent-work-object.helper';
import { serializeGenerationEntry } from '@serializers/helpers/generation-entry.helper';
import { serializeImageEdit } from '@serializers/helpers/image-edit.helper';
import { CONTENT_ENTITY_RELS } from '@serializers/relationships';

export const ingredientSerializerConfig = {
  attributes: ingredientAttributes,
  attributeDerivations: {
    generationEntry: serializeGenerationEntry,
    agentWorkObject: serializeAgentWorkObject,
    imageEdit: serializeImageEdit,
  },
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
