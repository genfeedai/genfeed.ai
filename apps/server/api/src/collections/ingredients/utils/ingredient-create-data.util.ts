import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';

const INGREDIENT_SCALAR_FIELDS = [
  'agentRunId',
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

export function toIngredientCreateData(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    ...pickDefinedFields(input, INGREDIENT_SCALAR_FIELDS),
  };

  const sourceIds = Array.from(new Set(toIds(input.sources)));
  if (sourceIds.length > 0) {
    data.sources = { connect: sourceIds.map((id) => ({ id })) };
  }

  const tagIds = Array.from(new Set(toIds(input.tags)));
  if (tagIds.length > 0) {
    data.tags = { connect: tagIds.map((id) => ({ id })) };
  }

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
}
