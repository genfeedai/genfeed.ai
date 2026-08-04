import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  IngredientCategory,
  IngredientExtension,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const toId = (value: unknown): string | undefined => {
  if (isEntityId(value)) {
    return value.trim();
  }
  return undefined;
};

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const id = toId(item);
        return id ? [id] : [];
      })
    : [];

const pickDefined = (
  body: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> =>
  Object.fromEntries(
    keys.flatMap((key) => (body[key] === undefined ? [] : [[key, body[key]]])),
  );

const METADATA_SCALAR_FIELDS = [
  'assistant',
  'description',
  'duration',
  'error',
  'externalId',
  'externalProvider',
  'fps',
  'hasAudio',
  'height',
  'model',
  'promptTemplate',
  'resolution',
  'result',
  'seed',
  'size',
  'style',
  'templateVersion',
  'width',
] as const;

const INGREDIENT_SCALAR_FIELDS = [
  'assetLabel',
  'campaign',
  'campaignWeek',
  'category',
  'cfgScale',
  'cdnUrl',
  'cloneStatus',
  'contentRating',
  'externalVoiceCatalogId',
  'externalVoiceId',
  'fileSize',
  'generationCompletedAt',
  'generationError',
  'generationProgress',
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
  'mimeType',
  'negativePrompt',
  'order',
  'personaSlug',
  'postedTo',
  'promptTemplate',
  'providerData',
  'qualityFeedback',
  'qualityScore',
  'qualityStatus',
  'reviewStatus',
  'sampleAudioUrl',
  's3Key',
  'scope',
  'status',
  'templateVersion',
  'transformations',
  'version',
  'voiceProvider',
  'voiceSource',
  'workflowUsed',
] as const;

const resolveMetadataLabel = (body: Record<string, unknown>): string => {
  if (typeof body.label === 'string' && body.label.trim()) {
    return body.label.trim();
  }

  const prompt =
    typeof body.text === 'string'
      ? body.text
      : typeof body.generationPrompt === 'string'
        ? body.generationPrompt
        : '';
  const normalizedPrompt = prompt.replace(/\s+/g, ' ').trim();

  if (!normalizedPrompt) {
    return 'Generated media';
  }

  return normalizedPrompt.length > 96
    ? `${normalizedPrompt.slice(0, 95).trimEnd()}…`
    : normalizedPrompt;
};

const resolveMetadataExtension = (body: Record<string, unknown>): unknown => {
  if (body.extension !== undefined) {
    return body.extension;
  }

  switch (String(body.category ?? '').toLowerCase()) {
    case IngredientCategory.MUSIC:
    case IngredientCategory.VOICE:
      return MetadataExtension.MP3;
    case IngredientCategory.VIDEO:
      return MetadataExtension.MP4;
    default:
      return MetadataExtension.JPEG;
  }
};

const toMetadataCreateData = (
  body: Record<string, unknown>,
  promptId: string | undefined,
) => {
  const tagIds = toIds(body.tags);

  return {
    ...pickDefined(body, METADATA_SCALAR_FIELDS),
    extension: resolveMetadataExtension(body),
    label: resolveMetadataLabel(body),
    ...(promptId ? { promptId } : {}),
    ...(tagIds.length > 0
      ? { tags: { connect: tagIds.map((id) => ({ id })) } }
      : {}),
  };
};

const toIngredientCreateData = (
  body: Record<string, unknown>,
  relations: {
    brandId: string | undefined;
    metadataId: string;
    organizationId: string | undefined;
    parentId: string | undefined;
    promptId: string | undefined;
    userId: string | undefined;
  },
) => {
  const sourceIds = Array.from(
    new Set([...toIds(body.sources), ...toIds(body.references)]),
  );
  const tagIds = toIds(body.tags);

  return {
    ...pickDefined(body, INGREDIENT_SCALAR_FIELDS),
    ...relations,
    folderId: toId(body.folderId) ?? toId(body.folder),
    trainingId: toId(body.trainingId) ?? toId(body.training),
    personaId: toId(body.personaId) ?? toId(body.persona),
    bookmarkId: toId(body.bookmarkId) ?? toId(body.bookmark),
    agentRunId: toId(body.agentRunId) ?? toId(body.agentRun),
    agentStrategyId: toId(body.agentStrategyId) ?? toId(body.agentStrategy),
    modelUsed: body.modelUsed ?? body.model,
    generationPrompt: body.generationPrompt ?? body.text,
    generationSeed: body.generationSeed ?? body.seed,
    isDefault: body.isDefault === true,
    status: body.status ?? IngredientStatus.PROCESSING,
    ...(sourceIds.length > 0
      ? { sources: { connect: sourceIds.map((id) => ({ id })) } }
      : {}),
    ...(tagIds.length > 0
      ? { tags: { connect: tagIds.map((id) => ({ id })) } }
      : {}),
  };
};

@Injectable()
export class SharedService {
  constructor(private readonly moduleRef: ModuleRef) {}

  private get ingredientsService(): IngredientsService {
    return this.moduleRef.get(IngredientsService, { strict: false });
  }

  private get metadataService(): MetadataService {
    return this.moduleRef.get(MetadataService, { strict: false });
  }

  private get promptsService(): PromptsService {
    return this.moduleRef.get(PromptsService, { strict: false });
  }

  public async saveDocuments(user: User, body: Record<string, unknown>) {
    const publicMetadata = getPublicMetadata(user);
    const promptId = toId(body.promptId) ?? toId(body.prompt);
    const parentId = toId(body.parentId) ?? toId(body.parent);
    const brandId =
      toId(body.brandId) || toId(body.brand) || publicMetadata.brand;
    const organizationId =
      toId(body.organizationId) ||
      toId(body.organization) ||
      publicMetadata.organization;
    const userId = toId(body.userId) || toId(body.user) || publicMetadata.user;

    const metadataData = (await this.metadataService.create(
      toMetadataCreateData(body, promptId) as CreateMetadataDto,
    )) as { id: string };

    let version = 1;
    if (parentId) {
      const parentMedia = await this.ingredientsService.findOne({
        _id: parentId,
      });

      if (parentMedia) {
        version = (parentMedia.version ?? 1) + 1;
      }
    }

    let ingredientData: IngredientDocument;
    try {
      ingredientData = (await this.ingredientsService.create(
        toIngredientCreateData(
          { ...body, version },
          {
            brandId,
            metadataId: metadataData.id,
            organizationId,
            parentId,
            promptId,
            userId,
          },
        ) as Parameters<IngredientsService['create']>[0],
      )) as unknown as IngredientDocument;
    } catch (error: unknown) {
      await this.metadataService
        .patch(metadataData.id, { isDeleted: true })
        .catch(() => undefined);
      throw error;
    }

    return { ingredientData, metadataData };
  }

  /**
   * Save documents with explicit IDs (for internal/orchestration use)
   * Use this when you don't have access to the legacy auth provider User object
   */
  public async saveDocumentsInternal(body: {
    brand: string;
    category: IngredientCategory;
    extension: IngredientExtension | MetadataExtension;
    organization: string;
    user: string;
    status?: IngredientStatus;
    prompt?: string;
    sources?: string[];
    parent?: string;
    [key: string]: unknown;
  }) {
    const promptId = toId(body.promptId) ?? toId(body.prompt);
    const parentId = toId(body.parentId) ?? toId(body.parent);
    const metadataData = (await this.metadataService.create(
      toMetadataCreateData(body, promptId) as unknown as CreateMetadataDto,
    )) as { id: string };

    let version = 1;
    if (parentId) {
      const parentMedia = await this.ingredientsService.findOne({
        _id: parentId,
      });
      if (parentMedia) {
        version = (parentMedia.version ?? 1) + 1;
      }
    }

    let ingredientData: IngredientDocument;
    try {
      ingredientData = (await this.ingredientsService.create(
        toIngredientCreateData(
          { ...body, version },
          {
            brandId: toId(body.brand),
            metadataId: metadataData.id,
            organizationId: toId(body.organization),
            parentId,
            promptId,
            userId: toId(body.user),
          },
        ) as Parameters<IngredientsService['create']>[0],
      )) as unknown as IngredientDocument;
    } catch (error: unknown) {
      await this.metadataService
        .patch(metadataData.id, { isDeleted: true })
        .catch(() => undefined);
      throw error;
    }

    return { ingredientData, metadataData };
  }

  public async updateDocuments(
    metadataData: { id: string },
    ingredientData: IngredientDocument,
    result: string,
    // TO DO
    // TEST ALL CASES BEFORE MAKING IT MANDATORY
    promptId?: string,
  ) {
    const validPromptId = toId(promptId);

    await this.metadataService.patch(metadataData.id, {
      promptId: validPromptId,
      result,
    });

    await this.ingredientsService.patch(ingredientData.id, {
      promptId: validPromptId,
      status: IngredientStatus.GENERATED,
    });

    // Update the prompt with the ingredient reference for bidirectional linking
    if (validPromptId) {
      await this.promptsService.patch(validPromptId, {
        ingredientId: ingredientData.id,
      });
    }
  }
}
