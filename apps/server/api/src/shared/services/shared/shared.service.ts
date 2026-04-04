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
import { isValidObjectId, Types } from 'mongoose';

const toObjectId = (value: unknown): Types.ObjectId | undefined => {
  if (value instanceof Types.ObjectId) {
    return value;
  }

  return typeof value === 'string' && isValidObjectId(value)
    ? new Types.ObjectId(value)
    : undefined;
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
    const promptId = toObjectId(body.prompt);
    const parentId = toObjectId(body.parent);
    const brandId =
      toObjectId(body.brand) || new Types.ObjectId(publicMetadata.brand);
    const organizationId =
      toObjectId(body.organization) ||
      new Types.ObjectId(publicMetadata.organization);
    const userId = new Types.ObjectId(publicMetadata.user);

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
        ...(toObjectId(body.frame) ? { frame: toObjectId(body.frame) } : {}),
        ...(parentId ? { parent: parentId } : {}),
        ...(promptId ? { prompt: promptId } : {}),
        ...(toObjectId(body.script) ? { script: toObjectId(body.script) } : {}),
        brand: brandId,
        isDefault: false,
        metadata: new Types.ObjectId(metadataData._id),
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
    brand: Types.ObjectId;
    category: IngredientCategory;
    extension: IngredientExtension | MetadataExtension;
    organization: Types.ObjectId;
    user: Types.ObjectId;
    status?: IngredientStatus;
    prompt?: Types.ObjectId;
    sources?: Types.ObjectId[];
    parent?: Types.ObjectId;
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
        metadata: new Types.ObjectId(metadataData._id),
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
    promptId?: Types.ObjectId,
  ) {
    await this.metadataService.patch(
      metadataData._id,
      new MetadataEntity({
        prompt: isValidObjectId(promptId)
          ? new Types.ObjectId(promptId)
          : undefined,
        result,
      }),
    );

    await this.ingredientsService.patch(ingredientData._id, {
      prompt: isValidObjectId(promptId)
        ? new Types.ObjectId(promptId)
        : undefined,
      status: IngredientStatus.GENERATED,
    });

    // Update the prompt with the ingredient reference for bidirectional linking
    if (promptId && isValidObjectId(promptId)) {
      await this.promptsService.patch(promptId, {
        ingredient: new Types.ObjectId(ingredientData._id),
      });
    }
  }
}
