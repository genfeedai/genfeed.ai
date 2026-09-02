import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AssetQueryDto } from '@api/collections/assets/dto/assets-query.dto';
import { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';
import { type AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import {
  getAssetParentId,
  getAssetParentIdField,
} from '@api/collections/assets/utils/asset-parent.util';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { CacheService } from '@api/services/cache/cache.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { AssetSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

type AssetMatchConditions = Record<string, unknown>;
type MutableAssetUpdate = {
  -readonly [K in keyof UpdateAssetDto]?: UpdateAssetDto[K];
};

@AutoSwagger()
@Controller('assets')
@UseGuards(RolesGuard)
export class AssetsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly assetsService: AssetsService,
    private readonly cacheService: CacheService,
    private readonly websocketService: NotificationsPublisherService,
  ) {}

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: AssetQueryDto,
    @Req() request: Request,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    // Use CollectionFilterUtil for common filtering patterns
    // Build match conditions
    const matchConditions: AssetMatchConditions = {
      isDeleted: QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted),
      userId: user.userId ?? user.id,
    };

    if (!query.parentType || query.parentType === AssetParent.BRAND) {
      matchConditions.parentBrandId = CollectionFilterUtil.buildBrandFilter(
        query.brandId,
        user,
        'user',
      );
    }

    // Add category filter if provided
    if (query.category) {
      matchConditions.category = query.category;
    }

    if (query.parentType) {
      matchConditions.parentType = query.parentType;
    }

    if (query.parentId) {
      if (query.parentType) {
        matchConditions[getAssetParentIdField(query.parentType)] =
          query.parentId;
      } else {
        matchConditions.OR = [
          { parentArticleId: query.parentId },
          { parentBrandId: query.parentId },
          { parentIngredientId: query.parentId },
          { parentOrgId: query.parentId },
        ];
      }
    }

    // Create secure aggregation pipeline
    const aggregate = {
      where: matchConditions as Record<string, unknown>,
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<AssetDocument> =
      await this.assetsService.findAll(aggregate, options);
    return serializeCollection(request, AssetSerializer, data);
  }

  @Get(':assetId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('assetId') assetId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const validatedId = InputValidationUtil.validateEntityId(
      assetId,
      'assetId',
    );

    // Find asset with ownership verification
    const asset = await this.assetsService.findOne({
      id: validatedId,
      userId: user.userId ?? user.id,
    });

    if (!asset) {
      return returnNotFound(this.constructorName, assetId);
    }

    return serializeSingle(request, AssetSerializer, asset);
  }

  @Patch(':assetId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('assetId') assetId: string,
    @CurrentUser() user: User,
    @Body() updateAssetDto: UpdateAssetDto,
  ): Promise<JsonApiSingleResponse> {
    const validatedId = InputValidationUtil.validateEntityId(
      assetId,
      'assetId',
    );

    const existingAsset = await this.assetsService.findOne({
      id: validatedId,
      userId: user.userId ?? user.id,
    });

    if (!existingAsset) {
      return returnNotFound(this.constructorName, assetId);
    }

    // Validate and sanitize update data
    const sanitizedUpdate: MutableAssetUpdate = {};

    if (updateAssetDto.category) {
      sanitizedUpdate.category = InputValidationUtil.validateString(
        updateAssetDto.category,
        'category',
        { maxLength: 50 },
      ) as AssetCategory;
    }

    if (updateAssetDto.parentType) {
      sanitizedUpdate.parentType = InputValidationUtil.validateString(
        updateAssetDto.parentType,
        'parentType',
        { maxLength: 50 },
      ) as AssetParent;
    }

    if (updateAssetDto.parentId) {
      EntityIdUtil.validate(updateAssetDto.parentId, 'parentId');
      sanitizedUpdate.parentId = updateAssetDto.parentId;
    }

    if (updateAssetDto.isDeleted !== undefined) {
      sanitizedUpdate.isDeleted = updateAssetDto.isDeleted;
    }

    const isSettingAsLogoOrBanner =
      (updateAssetDto.category === AssetCategory.LOGO ||
        updateAssetDto.category === AssetCategory.BANNER) &&
      updateAssetDto.parentId &&
      updateAssetDto.parentType === AssetParent.BRAND;

    if (isSettingAsLogoOrBanner) {
      await this.assetsService.patchAll(
        {
          id: { not: validatedId },
          category: updateAssetDto.category,
          parentBrandId: updateAssetDto.parentId,
          parentType: AssetParent.BRAND,
        },
        { isDeleted: true },
      );

      await this.cacheService.invalidateByTags([
        'brands',
        'links',
        'assets',
        'public',
      ]);

      if (updateAssetDto.parentId) {
        await this.cacheService.del(`brand:${updateAssetDto.parentId}`);
      }
    }

    const updatedAsset = await this.assetsService.patch(
      validatedId,
      sanitizedUpdate,
    );

    const userId = user.userId ?? user.id;
    if (
      userId &&
      updatedAsset &&
      [AssetCategory.LOGO, AssetCategory.BANNER].includes(
        String(updatedAsset.category).toUpperCase() as AssetCategory,
      ) &&
      String(updatedAsset.parentType) === 'BRAND' &&
      updatedAsset.parentBrandId
    ) {
      await this.websocketService.publishBrandRefresh(
        getAssetParentId(updatedAsset) as string,
        userId,
        {
          action: 'updated',
          assetId: updatedAsset.id.toString(),
          category: String(
            updatedAsset.category,
          ).toUpperCase() as AssetCategory,
        },
      );
    }

    return serializeSingle(request, AssetSerializer, updatedAsset);
  }

  @Delete(':assetId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @Param('assetId') assetId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const validatedId = InputValidationUtil.validateEntityId(
      assetId,
      'assetId',
    );

    const existingAsset = await this.assetsService.findOne({
      id: validatedId,
      userId: user.userId ?? user.id,
    });

    if (!existingAsset) {
      return returnNotFound(this.constructorName, assetId);
    }

    const deletedAsset = await this.assetsService.remove(validatedId);

    return deletedAsset
      ? serializeSingle(request, AssetSerializer, deletedAsset)
      : returnNotFound(this.constructorName, assetId);
  }
}
