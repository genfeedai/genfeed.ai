import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { CreateMetadataDto } from '@api/collections/metadata/dto/create-metadata.dto';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import type {
  InternalMediaDocumentsInput,
  MediaDocumentsInput,
} from '@api/shared/services/shared/media-documents.types';
import {
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

interface MediaDocumentOwnership {
  brandId?: string;
  organizationId?: string;
  userId?: string;
}

const normalizeId = (
  value: string | null | undefined,
  field: string,
): string | undefined => {
  if (value === null || value === undefined || value.trim() === '') {
    return undefined;
  }

  if (!isEntityId(value)) {
    throw new BadRequestException(`${field} must be a valid entity ID`);
  }

  return value.trim();
};

const normalizeIds = (values: string[] | undefined, field: string): string[] =>
  Array.from(
    new Set(
      (values ?? []).flatMap((value, index) => {
        const id = normalizeId(value, `${field}[${index}]`);
        return id ? [id] : [];
      }),
    ),
  );

const resolveMetadataLabel = (input: MediaDocumentsInput): string => {
  if (input.label?.trim()) {
    return input.label.trim();
  }

  const normalizedPrompt = (input.generationPrompt ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalizedPrompt) {
    return 'Generated media';
  }

  return normalizedPrompt.length > 96
    ? `${normalizedPrompt.slice(0, 95).trimEnd()}…`
    : normalizedPrompt;
};

const resolveMetadataExtension = (
  input: MediaDocumentsInput,
): MetadataExtension => {
  if (input.extension !== undefined) {
    if (
      Object.values(MetadataExtension).includes(
        input.extension as MetadataExtension,
      )
    ) {
      return input.extension as MetadataExtension;
    }

    throw new BadRequestException(
      `extension must be a supported metadata extension`,
    );
  }

  switch (String(input.category).toUpperCase()) {
    case IngredientCategory.MUSIC:
    case IngredientCategory.VOICE:
      return MetadataExtension.MP3;
    case IngredientCategory.VIDEO:
      return MetadataExtension.MP4;
    default:
      return MetadataExtension.JPEG;
  }
};

const buildMetadataCreateDto = (
  input: MediaDocumentsInput,
  promptId: string | undefined,
  tagIds: string[],
): CreateMetadataDto => ({
  ...(input.assistant !== undefined ? { assistant: input.assistant } : {}),
  ...(input.description !== undefined
    ? { description: input.description }
    : {}),
  ...(input.duration !== undefined ? { duration: input.duration } : {}),
  ...(input.externalId !== undefined ? { externalId: input.externalId } : {}),
  ...(input.externalProvider !== undefined
    ? { externalProvider: input.externalProvider }
    : {}),
  ...(input.hasAudio !== undefined ? { hasAudio: input.hasAudio } : {}),
  ...(input.height !== undefined ? { height: input.height } : {}),
  ...(input.model !== undefined ? { model: input.model } : {}),
  ...(input.promptTemplate !== undefined
    ? { promptTemplate: input.promptTemplate }
    : {}),
  ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
  ...(input.result !== undefined ? { result: input.result } : {}),
  ...(input.size !== undefined ? { size: input.size } : {}),
  ...(input.style !== undefined ? { style: input.style } : {}),
  ...(input.generationSeed !== undefined ? { seed: input.generationSeed } : {}),
  ...(input.templateVersion !== undefined
    ? { templateVersion: input.templateVersion }
    : {}),
  ...(input.width !== undefined ? { width: input.width } : {}),
  extension: resolveMetadataExtension(input),
  label: resolveMetadataLabel(input),
  ...(promptId ? { promptId } : {}),
  ...(tagIds.length > 0 ? { tags: tagIds } : {}),
});

const buildIngredientCreateDto = (
  input: MediaDocumentsInput,
  ownership: MediaDocumentOwnership,
  metadataId: string,
  parentId: string | undefined,
  promptId: string | undefined,
  sourceIds: string[],
  tagIds: string[],
  version: number,
): CreateIngredientDto => ({
  ...(input.bookmarkId !== undefined ? { bookmarkId: input.bookmarkId } : {}),
  ...(ownership.brandId ? { brandId: ownership.brandId } : {}),
  category: input.category,
  ...(input.generationPrompt !== undefined
    ? { generationPrompt: input.generationPrompt }
    : {}),
  ...(input.generationSeed !== undefined
    ? { generationSeed: input.generationSeed }
    : {}),
  ...(input.generationSource !== undefined
    ? { generationSource: input.generationSource }
    : {}),
  ...(input.groupId !== undefined ? { groupId: input.groupId } : {}),
  ...(input.groupIndex !== undefined ? { groupIndex: input.groupIndex } : {}),
  isDefault: input.isDefault === true,
  ...(input.isMergeEnabled !== undefined
    ? { isMergeEnabled: input.isMergeEnabled }
    : {}),
  ...(input.language !== undefined ? { language: input.language } : {}),
  metadataId,
  ...(input.model !== undefined ? { modelUsed: input.model } : {}),
  ...(input.negativePrompt !== undefined
    ? { negativePrompt: input.negativePrompt }
    : {}),
  ...(input.order !== undefined ? { order: input.order } : {}),
  ...(ownership.organizationId
    ? { organizationId: ownership.organizationId }
    : {}),
  ...(parentId ? { parentId } : {}),
  ...(promptId ? { promptId } : {}),
  ...(input.providerData !== undefined
    ? { providerData: input.providerData }
    : {}),
  ...(input.scope !== undefined ? { scope: input.scope } : {}),
  ...(input.sourceActionId !== undefined
    ? { sourceActionId: input.sourceActionId }
    : {}),
  ...(sourceIds.length > 0 ? { sources: sourceIds } : {}),
  status: input.status ?? IngredientStatus.PROCESSING,
  ...(tagIds.length > 0 ? { tags: tagIds } : {}),
  ...(input.transformations !== undefined
    ? { transformations: input.transformations }
    : {}),
  ...(ownership.userId ? { userId: ownership.userId } : {}),
  version,
  ...(input.voiceSource !== undefined
    ? { voiceSource: input.voiceSource }
    : {}),
});

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

  public async createMediaDocuments(user: User, input: MediaDocumentsInput) {
    return this.persistMediaDocuments(input, {
      brandId:
        normalizeId(input.brandId, 'brandId') ??
        normalizeId(user.brandId, 'user.brandId'),
      organizationId:
        normalizeId(input.organizationId, 'organizationId') ??
        normalizeId(user.organizationId, 'user.organizationId'),
      userId:
        normalizeId(input.userId, 'userId') ??
        normalizeId(user.userId ?? user.id, '(user.userId ?? user.id)'),
    });
  }

  /**
   * Creates media documents for internal callers with explicit ownership IDs.
   */
  public async createMediaDocumentsInternal(
    input: InternalMediaDocumentsInput,
  ) {
    return this.persistMediaDocuments(input, {
      brandId: normalizeId(input.brandId, 'brandId'),
      organizationId: normalizeId(input.organizationId, 'organizationId'),
      userId: normalizeId(input.userId, 'userId'),
    });
  }

  private async persistMediaDocuments(
    input: MediaDocumentsInput,
    ownership: MediaDocumentOwnership,
  ) {
    const promptId = normalizeId(input.promptId, 'promptId');
    const parentId = normalizeId(input.parentId, 'parentId');
    const sourceIds = normalizeIds(input.sourceIds, 'sourceIds');
    const tagIds = normalizeIds(input.tagIds, 'tagIds');
    const metadataData = await this.metadataService.create(
      buildMetadataCreateDto(input, promptId, tagIds),
    );

    let version = 1;
    if (parentId) {
      const parentMedia = await this.ingredientsService.findOne({
        id: parentId,
      });
      if (parentMedia) {
        version = (parentMedia.version ?? 1) + 1;
      }
    }

    let ingredientData: IngredientDocument;
    try {
      ingredientData = await this.ingredientsService.create(
        buildIngredientCreateDto(
          input,
          ownership,
          metadataData.id,
          parentId,
          promptId,
          sourceIds,
          tagIds,
          version,
        ),
      );
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
    const validPromptId = normalizeId(promptId, 'promptId');

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
