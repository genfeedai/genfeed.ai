import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';

const INGREDIENT_SCALAR_FIELDS = [
  'workflowExecutionId',
  'agentStrategyId',
  'assetLabel',
  'bookmarkId',
  'brandId',
  'campaign',
  'campaignWeek',
  'category',
  'cdnUrl',
  'cfgScale',
  'cloneStatus',
  'contentRating',
  'externalVoiceCatalogId',
  'externalVoiceId',
  'fileSize',
  'folderId',
  'generationCompletedAt',
  'generationError',
  'generationProgress',
  'generationPrompt',
  'generationSeed',
  'generationSource',
  'generationStage',
  'generationStartedAt',
  'generationSteps',
  'groupId',
  'groupIndex',
  'isCloned',
  'isDefault',
  'isDefaultSelectable',
  'isDeleted',
  'isFeatured',
  'isFavorite',
  'isHighlighted',
  'isMergeEnabled',
  'isPublic',
  'isVoiceActive',
  'language',
  'loraUsed',
  'metadataId',
  'mimeType',
  'modelUsed',
  'negativePrompt',
  'order',
  'organizationId',
  'parentId',
  'personaId',
  'personaSlug',
  'postedTo',
  'promptId',
  'promptTemplate',
  'providerData',
  'qualityFeedback',
  'qualityScore',
  'qualityStatus',
  'reviewStatus',
  's3Key',
  'sampleAudioUrl',
  'scope',
  'sourceActionId',
  'status',
  'templateVersion',
  'trainingId',
  'transformations',
  'userId',
  'version',
  'voiceProvider',
  'voiceSource',
  'workflowUsed',
] as const;

function toId(value: unknown): string | undefined {
  return isEntityId(value) ? value.trim() : undefined;
}

function toIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const id = toId(entry);
        return id ? [id] : [];
      })
    : [];
}

function assignRelationIds(
  data: Record<string, unknown>,
  input: Record<string, unknown>,
  field: 'sources' | 'tags',
  operation: 'connect' | 'set',
): void {
  if (!Object.hasOwn(input, field)) {
    return;
  }

  const ids = Array.from(new Set(toIds(input[field])));
  if (operation === 'connect' && ids.length === 0) {
    return;
  }

  data[field] = { [operation]: ids.map((id) => ({ id })) };
}

export function toIngredientCreateData(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    ...pickDefinedFields(input, INGREDIENT_SCALAR_FIELDS),
  };

  assignRelationIds(data, input, 'sources', 'connect');
  assignRelationIds(data, input, 'tags', 'connect');

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}

export function toIngredientUpdateData(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    ...pickDefinedFields(input, INGREDIENT_SCALAR_FIELDS),
  };

  assignRelationIds(data, input, 'sources', 'set');
  assignRelationIds(data, input, 'tags', 'set');

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}
