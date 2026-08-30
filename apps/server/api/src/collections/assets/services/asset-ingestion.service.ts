import type { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import {
  AssetCategory,
  AssetParent,
  categoryToPlural,
  FileInputType,
  IngredientCategory,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import type { CreateAssetDto } from '@server/collections/assets/dto/create-asset.dto';
import type { AssetDocument } from '@server/collections/assets/schemas/asset.schema';
import { AssetsService } from '@server/collections/assets/services/assets.service';
import { getAssetParentId } from '@server/collections/assets/utils/asset-parent.util';
import { IngredientsService } from '@server/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@server/collections/metadata/services/metadata.service';
import { ValidationException } from '@server/exceptions/validation.exception';
import { isEntityId } from '@server/helpers/validation/entity-id.validator';
import { CacheService } from '@server/services/cache/cache.service';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@server/services/notifications/publisher/notifications-publisher.service';

const ASSET_CACHE_TAGS = ['brands', 'links', 'assets', 'public'];

@Injectable()
export class AssetIngestionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly assetsService: AssetsService,
    private readonly cacheService: CacheService,
    private readonly filesClientService: FilesClientService,
    private readonly ingredientsService: IngredientsService,
    private readonly loggerService: LoggerService,
    private readonly metadataService: MetadataService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  async createUpload(
    user: User,
    file: Express.Multer.File,
    uploadDto: CreateAssetDto,
  ): Promise<AssetDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { category: uploadDto.category });

    try {
      const userId = user.userId ?? user.id;
      const entityData = {
        category: uploadDto.category,
        parentId:
          uploadDto.parentId && isEntityId(uploadDto.parentId)
            ? uploadDto.parentId
            : undefined,
        parentType: uploadDto.parentType,
        userId,
      };

      this.loggerService.log(`${url} - Creating asset with data`, {
        entityData: {
          ...entityData,
          parentId: entityData.parentId,
          userId: entityData.userId,
        },
      });

      if (
        [AssetCategory.LOGO, AssetCategory.BANNER].includes(
          uploadDto.category,
        ) &&
        entityData.parentId &&
        uploadDto.parentType === AssetParent.BRAND
      ) {
        await this.assetsService.patchAll(
          {
            category: uploadDto.category,
            parentBrandId: entityData.parentId,
            parentType: AssetParent.BRAND,
          },
          { isDeleted: true },
        );

        await this.invalidateBrandAssets(entityData.parentId);
      }

      const assetData = await this.assetsService.create(entityData);

      this.loggerService.log(`${url} - Asset created successfully`, {
        assetId: assetData.id,
        category: assetData.category,
        parentId: getAssetParentId(assetData),
        parentType: assetData.parentType,
      });

      await this.filesClientService.uploadToS3(
        assetData.id,
        categoryToPlural(uploadDto.category),
        {
          contentType: file.mimetype,
          data: file.buffer,
          type: FileInputType.BUFFER,
        },
      );

      if (userId) {
        await this.publishAssetCompleted(assetData, userId);

        if (
          uploadDto.parentId &&
          [AssetCategory.LOGO, AssetCategory.BANNER].includes(
            uploadDto.category,
          )
        ) {
          await this.websocketService.publishBrandRefresh(
            uploadDto.parentId,
            userId,
            {
              assetId: assetData.id.toString(),
              category: uploadDto.category,
            },
          );
        }

        this.loggerService.log(`${url} - Published websocket event`, {
          assetId: assetData.id,
          category: assetData.category,
          userId,
        });
      }

      this.loggerService.log(`${url} completed`);
      return assetData;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async createFromIngredient(
    user: User,
    createFromIngredientDto: CreateFromIngredientDto,
  ): Promise<AssetDocument> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`);

    const validatedIngredientId = InputValidationUtil.validateEntityId(
      createFromIngredientDto.ingredientId,
      'ingredientId',
    );
    const validatedCategory = createFromIngredientDto.category;

    if (
      ![AssetCategory.LOGO, AssetCategory.BANNER].includes(validatedCategory)
    ) {
      throw new ValidationException('Category must be logo or banner');
    }

    const validatedParent = InputValidationUtil.validateEntityId(
      createFromIngredientDto.parentId,
      'parentId',
    );
    const userId = user.userId ?? user.id;
    const ingredient = await this.ingredientsService.findOne({
      id: validatedIngredientId,
      userId,
    });

    if (!ingredient) {
      return returnNotFound('Ingredient', validatedIngredientId);
    }

    if (String(ingredient.category) !== IngredientCategory.IMAGE) {
      throw new ValidationException('Only images can be set as logo or banner');
    }

    if (!ingredient.metadataId) {
      throw new ValidationException('Ingredient metadata not found');
    }

    const metadata = await this.metadataService.findOne({
      id: ingredient.metadataId,
    });

    if (!metadata) {
      throw new ValidationException('Ingredient metadata not found');
    }

    const ingredientType = 'images';
    const sourceKey = `ingredients/${ingredientType}/${validatedIngredientId}`;

    await this.assetsService.patchAll(
      {
        category: validatedCategory,
        parentBrandId: validatedParent,
        parentType: AssetParent.BRAND,
      },
      { isDeleted: true },
    );

    const assetData = await this.assetsService.create({
      category: validatedCategory,
      parentId: validatedParent,
      parentType: AssetParent.BRAND,
      userId,
    });
    const destinationKey = `ingredients/${categoryToPlural(validatedCategory)}/${assetData.id}`;

    try {
      const sourceMatch = sourceKey.match(/ingredients\/([^/]+)\/(.+)$/);
      const sourceType = sourceMatch ? sourceMatch[1] : undefined;
      const sourceKeyOnly = sourceMatch
        ? sourceMatch[2]
        : sourceKey.replace(/^ingredients\/[^/]+\//, '');

      await this.filesClientService.copyInS3(
        sourceKeyOnly,
        assetData.id.toString(),
        sourceType,
        categoryToPlural(validatedCategory),
      );
    } catch (error) {
      this.loggerService.error(`${url} - Failed to copy file from S3`, {
        destinationKey,
        error,
        sourceKey,
      });

      await this.assetsService.remove(assetData.id);

      throw new ValidationException(
        'Failed to copy ingredient file. The source file may not exist or there was an S3 error.',
      );
    }

    await this.invalidateBrandAssets(validatedParent);

    if (userId) {
      await this.publishAssetCompleted(assetData, userId);
      await this.websocketService.publishBrandRefresh(
        validatedParent.toString(),
        userId,
        {
          assetId: assetData.id.toString(),
          category: validatedCategory,
        },
      );
    }

    this.loggerService.log(`${url} completed`, {
      assetId: assetData.id,
      category: validatedCategory,
      ingredientId: validatedIngredientId,
    });

    return assetData;
  }

  private async invalidateBrandAssets(parentId: string): Promise<void> {
    await this.cacheService.invalidateByTags(ASSET_CACHE_TAGS);
    await this.cacheService.del(`brand:${parentId}`);
  }

  private async publishAssetCompleted(
    assetData: AssetDocument,
    userId: string,
  ): Promise<void> {
    await this.websocketService.publishAssetStatus(
      assetData.id.toString(),
      'completed',
      userId,
      {
        assetId: assetData.id.toString(),
        category: assetData.category,
        parentId: getAssetParentId(assetData),
        parentType: assetData.parentType,
      },
    );
  }
}
