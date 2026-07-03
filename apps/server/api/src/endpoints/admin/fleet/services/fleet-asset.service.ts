import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ConfigService } from '@api/config/config.service';
import { AdminFleetTrainingService } from '@api/endpoints/admin/fleet/services/fleet-training.service';
import { AdminFleetValueReader } from '@api/endpoints/admin/fleet/services/fleet-value-reader.util';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  type ContentRating,
  type DarkroomAssetLabel,
  type DarkroomReviewStatus,
  DarkroomReviewStatus as DarkroomReviewStatusEnum,
  FileInputType,
  IngredientCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Owns fleet asset (ingredient) listing + review, and the approved-asset
 * dataset sync that promotes approved images into the training dataset.
 */
@Injectable()
export class AdminFleetAssetService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly filesClientService: FilesClientService,
    private readonly adminFleetTrainingService: AdminFleetTrainingService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Get assets (ingredients) for a persona
   */
  getAssets(
    organizationId: string,
    filters: {
      personaSlug?: string;
      reviewStatus?: DarkroomReviewStatus;
      assetLabel?: DarkroomAssetLabel;
      contentRating?: ContentRating;
      campaign?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<IngredientDocument[]> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, { filters, organizationId });

    const query: Record<string, unknown> = {
      persona: { not: true },
    };

    if (filters.personaSlug) {
      query.personaSlug = filters.personaSlug;
    }
    if (filters.reviewStatus) {
      query.reviewStatus = filters.reviewStatus;
    }
    if (filters.assetLabel) {
      query.assetLabel = filters.assetLabel;
    }
    if (filters.contentRating) {
      query.contentRating = filters.contentRating;
    }
    if (filters.campaign) {
      query.campaign = filters.campaign;
    }

    return this.ingredientsService.findAllByOrganization(organizationId, query);
  }

  /**
   * Review an asset (approve/reject)
   */
  async reviewAsset(
    ingredientId: string,
    organizationId: string,
    reviewStatus: DarkroomReviewStatus,
  ): Promise<IngredientDocument> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(caller, {
      ingredientId,
      organizationId,
      reviewStatus,
    });

    // Verify ingredient belongs to organization before updating (multi-tenant guard)
    const ingredient = await this.ingredientsService.findOne({
      _id: ingredientId,
      isDeleted: false,
      organization: organizationId,
    });

    if (!ingredient) {
      throw new NotFoundException(
        `Asset "${ingredientId}" in organization "${organizationId}"`,
      );
    }

    const updated = await this.ingredientsService.patch(ingredientId, {
      reviewStatus,
    } as Parameters<IngredientsService['patch']>[1]);

    if (
      reviewStatus === DarkroomReviewStatusEnum.APPROVED &&
      !AdminFleetValueReader.hasReviewStatus(
        ingredient.reviewStatus,
        DarkroomReviewStatusEnum.APPROVED,
      ) &&
      ingredient.personaSlug &&
      ingredient.cdnUrl &&
      AdminFleetValueReader.hasIngredientCategory(
        ingredient.category,
        IngredientCategory.IMAGE,
      )
    ) {
      await this.syncApprovedAssetToDataset(
        organizationId,
        ingredient.personaSlug,
        ingredient,
      );
    }

    return updated;
  }

  private async syncApprovedAssetToDataset(
    _organizationId: string,
    slug: string,
    ingredient: IngredientDocument,
  ): Promise<void> {
    const sourceUrl = ingredient.cdnUrl;
    if (!sourceUrl) {
      return;
    }

    const extension = AdminFleetValueReader.getDatasetExtension(
      sourceUrl,
      ingredient.category,
    );
    const datasetKey = `darkroom/datasets/${slug}/${ingredient.id.toString()}.${extension}`;
    await this.filesClientService.uploadToS3(datasetKey, 'images', {
      type: FileInputType.URL,
      url: sourceUrl,
    });

    const s3Keys = [datasetKey];
    const caption =
      AdminFleetValueReader.readString(ingredient.generationPrompt) ??
      AdminFleetValueReader.readString(ingredient.text);
    if (caption) {
      const captionKey = `darkroom/datasets/${slug}/${ingredient.id.toString()}.txt`;
      await this.filesClientService.uploadToS3(captionKey, 'images', {
        contentType: 'text/plain',
        data: Buffer.from(caption, 'utf8'),
        type: FileInputType.BUFFER,
      });
      s3Keys.push(captionKey);
    }

    await this.adminFleetTrainingService.syncDataset(
      slug,
      s3Keys,
      AdminFleetValueReader.readString(
        this.configService.get('DARKROOM_S3_BUCKET'),
      ),
    );

    await this.ingredientsService.patch(ingredient.id.toString(), {
      generationCompletedAt: ingredient.generationCompletedAt ?? new Date(),
    } as Parameters<IngredientsService['patch']>[1]);
  }
}
