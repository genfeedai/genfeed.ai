import { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataDocument } from '@api/collections/metadata/schemas/metadata.schema';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { categoryToPlural } from '@api/helpers/utils/category-conversion/category-conversion.util';
import { UserExtractionUtil } from '@api/helpers/utils/user-extraction/user-extraction.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface MetadataLookupResult {
  metadata: MetadataDocument;
  ingredient: IngredientDocument;
}

@Injectable()
export class MetadataLookupService {
  private readonly logContext = 'MetadataLookupService';

  constructor(
    private readonly metadataService: MetadataService,
    private readonly ingredientsService: IngredientsService,
    private readonly websocketService: NotificationsPublisherService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Finds metadata with fallback from indexed externalId to base prediction ID.
   */
  async findMetadataWithFallback(
    externalId: string,
  ): Promise<MetadataDocument | null> {
    let metadata = await this.metadataService.findOne({
      externalId,
      isDeleted: false,
    });

    if (!metadata && externalId.includes('_')) {
      const baseExternalId = externalId.split('_')[0];
      this.loggerService.warn(
        `${this.logContext} metadata not found with indexed externalId, trying base ID`,
        { baseExternalId, externalId },
      );
      metadata = await this.metadataService.findOne({
        externalId: baseExternalId,
        isDeleted: false,
      });
    }

    return metadata;
  }

  /**
   * Handles the case when metadata is not found — publishes WebSocket error
   * and marks the ingredient as FAILED if it can be located.
   */
  async handleMetadataNotFound(
    externalId: string,
    category: IngredientCategory | string,
    url: string,
    integration: string,
  ): Promise<void> {
    this.loggerService.error('Metadata not found', {
      category: String(category),
      externalId,
      hint: 'Check if metadata was created with correct externalId format',
      integration,
      url,
    });

    try {
      const baseExternalIdForSearch = externalId.includes('_')
        ? externalId.split('_')[0]
        : externalId;

      const foundMetadata = await this.metadataService.findOne({
        externalId: baseExternalIdForSearch,
        isDeleted: false,
      });

      if (!foundMetadata) {
        return;
      }

      const ingredient = await this.ingredientsService.findOne(
        { metadata: foundMetadata._id },
        [PopulatePatterns.userMinimal],
      );

      if (!ingredient) {
        return;
      }

      const { dbUserId, clerkUserId, userId, userRoom } =
        UserExtractionUtil.extractUserIds(ingredient.user);

      if (!clerkUserId && dbUserId) {
        this.loggerService.warn(
          `${this.logContext} user missing clerkId - WebSocket room may not match client room`,
          {
            dbUserId,
            ingredientId: ingredient._id,
            note: 'Client joins room using Clerk ID from JWT, but backend has no clerkId in DB',
          },
        );
      }

      if (userId) {
        const websocketUrl = `/${categoryToPlural(category)}/${ingredient._id}`;
        const errorMessage =
          'Generation failed: Metadata not found. Please contact support if this persists.';

        await this.websocketService.publishMediaFailed(
          websocketUrl,
          errorMessage,
          userId,
          userRoom,
        );

        await this.ingredientsService.patch(ingredient._id.toString(), {
          status: IngredientStatus.FAILED,
        });

        this.loggerService.log(
          `${this.logContext} published websocket error for metadata not found`,
          {
            externalId,
            ingredientId: ingredient._id,
            userId,
          },
        );
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.logContext} failed to publish websocket error`,
        error,
      );
    }
  }

  /**
   * Full metadata + ingredient lookup pipeline.
   * Returns both or throws if metadata not found.
   */
  async lookupMetadataAndIngredient(
    externalId: string,
    category: IngredientCategory | string,
    url: string,
    integration: string,
  ): Promise<MetadataLookupResult> {
    const metadata = await this.findMetadataWithFallback(externalId);

    if (!metadata) {
      await this.handleMetadataNotFound(externalId, category, url, integration);
      throw new Error('Metadata not found');
    }

    await this.metadataService.patch(metadata._id, { result: url });

    const ingredient = await this.ingredientsService.findOne(
      { metadata: metadata._id },
      [PopulatePatterns.userMinimal],
    );

    if (!ingredient) {
      this.loggerService.error(
        'Ingredient not found for metadata',
        metadata._id,
      );
      throw new Error('Ingredient not found');
    }

    return { ingredient, metadata };
  }
}
