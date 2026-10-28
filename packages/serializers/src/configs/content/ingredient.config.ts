import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { rel, simpleConfig } from '@serializers/builders';
import { serializeAgentWorkObject } from '@serializers/helpers/agent-work-object.helper';
import { serializeEnhancementFailed } from '@serializers/helpers/generation-enhancement.helper';
import { serializeGenerationEntry } from '@serializers/helpers/generation-entry.helper';
import { serializeImageEdit } from '@serializers/helpers/image-edit.helper';
import { CONTENT_ENTITY_RELS } from '@serializers/relationships';

/**
 * The prompt row behind a generation: the text the person wrote, its structured
 * slots, and the prose the model was sent for them. Studio shows these in the
 * inspector and restores them when a generation is edited and run again.
 */
export const ingredientPromptAttributes = [
  'original',
  'enhanced',
  'subject',
  'action',
  'scene',
  'style',
  'mood',
  'camera',
  'cameraMovement',
  'lens',
  'lighting',
  'sounds',
  'speech',
  'blacklists',
  'renderedPrompt',
  'renderTarget',
];

export const ingredientSerializerConfig = {
  attributes: ingredientAttributes,
  attributeDerivations: {
    isEnhancementFailed: serializeEnhancementFailed,
    generationEntry: serializeGenerationEntry,
    agentWorkObject: serializeAgentWorkObject,
    imageEdit: serializeImageEdit,
  },
  type: 'ingredient',
  ...CONTENT_ENTITY_RELS,
  metadata: rel('metadata', metadataAttributes),
  prompt: rel('prompt', ingredientPromptAttributes),
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
    'zoomEaseCurve',
    'zoomConfigs',
    'isMuteVideoAudio',
    'musicVolume',
  ],
);
