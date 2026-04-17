import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import {
  IngredientCategory,
  IngredientExtension,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

const toId = (value: unknown): string | undefined => {
  if (typeof value === 'string' && OBJECT_ID_REGEX.test(value)) {
    return value;
  }
  return undefined;
};

@Injectable()
export class SharedService {
  constructor(
    private readonly moduleRef: ModuleRef,

    private readonly ingredientsService: IngredientsService,
    private readonly promptsService: PromptsService,
  ) {}

  private get metadataService(): MetadataService {
    return this.moduleRef.get(MetadataService, { strict: false });
  }

  public async saveDocuments(user: User, body: Record<string, unknown>) {
    const publicMetadata = getPublicMetadata(user);
    const promptId = toId(body.prompt);
    const parentId = toId(body.parent);
    const brandId = toId(body.brand) || publicMetadata.brand;
    const organizationId =
      toId(body.organization) || publicMetadata.organization;
    const userId = publicMetadata.user;

    // @ts-expect-error TS2739
    const metadataData = (await this.metadataService.create(
      new MetadataEntity({
        ...body,
        ...(promptId ? { prompt: promptId } : {}),
      }),
    )) as MetadataEntity;

    let version = 1;
    if (parentId) {
      const parentMedia = await this.ingredientsService.findOne({
        _id: parentId,
      });

      if (parentMedia) {
        version = (parentMedia.version ?? 1) + 1;
      }
    }

    const ingredientData = (await this.ingredientsService.create(
      new IngredientEntity({
        ...body,
        ...(toId(body.frame) ? { frame: toId(body.frame) } : {}),
        ...(parentId ? { parent: parentId } : {}),
        ...(promptId ? { prompt: promptId } : {}),
        ...(toId(body.script) ? { script: toId(body.script) } : {}),
        brand: brandId,
        isDefault: false,
        metadata: metadataData._id,
        organization: organizationId,
        status:
          (body.status as IngredientStatus) || IngredientStatus.PROCESSING,
        user: userId,
        version,
      }),
    )) as unknown as IngredientEntity;

    return { ingredientData, metadataData };
  }

  /**
   * Save documents with explicit IDs (for internal/orchestration use)
   * Use this when you don't have access to the Clerk User object
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
    // @ts-expect-error TS2739
    const metadataData = (await this.metadataService.create(
      new MetadataEntity({
        ...body,
        ...(body.prompt ? { prompt: body.prompt } : {}),
      }),
    )) as MetadataEntity;

    let version = 1;
    if (body.parent) {
      const parentMedia = await this.ingredientsService.findOne({
        _id: body.parent,
      });
      if (parentMedia) {
        version = (parentMedia.version ?? 1) + 1;
      }
    }

    const ingredientData = (await this.ingredientsService.create(
      new IngredientEntity({
        ...body,
        brand: body.brand,
        isDefault: false,
        metadata: metadataData._id,
        organization: body.organization,
        status: body.status || IngredientStatus.PROCESSING,
        user: body.user,
        version,
      }),
    )) as unknown as IngredientEntity;

    return { ingredientData, metadataData };
  }

  public async updateDocuments(
    metadataData: MetadataEntity,
    ingredientData: IngredientEntity,
    result: string,
    // TO DO
    // TEST ALL CASES BEFORE MAKING IT MANDATORY
    promptId?: string,
  ) {
    const validPromptId =
      promptId && OBJECT_ID_REGEX.test(promptId) ? promptId : undefined;

    await this.metadataService.patch(
      metadataData._id,
      new MetadataEntity({
        prompt: validPromptId,
        result,
      }),
    );

    await this.ingredientsService.patch(ingredientData._id, {
      prompt: validPromptId,
      status: IngredientStatus.GENERATED,
    });

    // Update the prompt with the ingredient reference for bidirectional linking
    if (validPromptId) {
      await this.promptsService.patch(validPromptId, {
        ingredient: ingredientData._id,
      });
    }
  }
}
