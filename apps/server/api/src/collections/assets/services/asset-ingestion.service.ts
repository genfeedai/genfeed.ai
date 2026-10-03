import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { CreateAssetDto } from '@api/collections/assets/dto/create-asset.dto';
import type { CreateFromIngredientDto } from '@api/collections/assets/dto/create-from-ingredient.dto';
import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { getAssetParentId } from '@api/collections/assets/utils/asset-parent.util';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { CacheService } from '@api/services/cache/cache.service';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetCategory,
  AssetParent,
  categoryToPlural,
  FileInputType,
  IngredientCategory,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

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
    private readonly prisma: PrismaService,
  ) {}

  /**
   * A logo or banner may only be attached to a parent in the caller's own
   * organization. Returns that organization so the asset is stamped with it
   * (`parentOrgId`), which org-scoped readers such as the brand kit require.
   */
  private async resolveParentOrganizationId(
    user: User,
    parentType: AssetParent,
    parentId: string,
  ): Promise<string> {
    const organizationId = user.organizationId;

    if (!organizationId || !isEntityId(organizationId)) {
      throw new ForbiddenException('Organization not found in session');
    }

    if (parentType === AssetParent.ORGANIZATION) {
      if (parentId !== organizationId) {
        throw new ForbiddenException('Access denied to this organization');
      }
      return organizationId;
    }

    if (parentType === AssetParent.BRAND) {
      const brand = await this.prisma.brand.findFirst({
        select: { id: true },
        where: { id: parentId, isDeleted: false, organizationId },
      });
      if (!brand) {
        return returnNotFound('Brand', parentId);
      }
      return organizationId;
    }

    throw new BadRequestException('Unsupported asset parent');
  }

  async createUpload(
    user: User,
    file: Express.Multer.File,
    uploadDto: CreateAssetDto,
  ): Promise<AssetDocument> {
    if (uploadDto.category === AssetCategory.FONT)
      throw new BadRequestException('font_asset_dedicated_route_required');
    if (
      ![
        AssetCategory.LOGO,
        AssetCategory.BANNER,
        AssetCategory.REFERENCE,
      ].includes(uploadDto.category)
    )
      throw new BadRequestException('Invalid asset category');
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { category: uploadDto.category });

    try {
      const userId = user.userId ?? user.id;
      const parentId =
        uploadDto.parentId && isEntityId(uploadDto.parentId)
          ? uploadDto.parentId
          : undefined;
      const organizationId = parentId
        ? await this.resolveParentOrganizationId(
            user,
            uploadDto.parentType,
            parentId,
          )
        : undefined;
      const entityData = {
        category: uploadDto.category,
        organizationId,
        parentId,
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

      // One logo per organization: the new upload replaces the previous one.
      if (
        uploadDto.category === AssetCategory.LOGO &&
        entityData.parentId &&
        uploadDto.parentType === AssetParent.ORGANIZATION
      ) {
        await this.assetsService.patchAll(
          {
            category: AssetCategory.LOGO,
            parentOrgId: entityData.parentId,
            parentType: AssetParent.ORGANIZATION,
          },
          { isDeleted: true },
        );
        await this.cacheService.invalidateByTags(['organizations']);
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
          uploadDto.parentType === AssetParent.BRAND &&
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
    if (createFromIngredientDto.category === AssetCategory.FONT)
      throw new BadRequestException('font_asset_dedicated_route_required');
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
    const organizationId = await this.resolveParentOrganizationId(
      user,
      AssetParent.BRAND,
      validatedParent,
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
      organizationId,
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
