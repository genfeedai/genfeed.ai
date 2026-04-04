import type { AssetQueryDto } from '@api/collections/assets/dto/assets-query.dto';
import type { UpdateAssetDto } from '@api/collections/assets/dto/update-asset.dto';
import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { InputValidationUtil } from '@api/helpers/utils/input-validation/input-validation.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { CacheService } from '@api/services/cache/services/cache.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { AssetSerializer } from '@genfeedai/serializers';
import { AssetCategory, AssetParent } from '@genfeedai/enums';
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
import { type PipelineStage, Types } from 'mongoose';

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
    const publicMetadata = getPublicMetadata(user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    // Use CollectionFilterUtil for common filtering patterns
    const parent = CollectionFilterUtil.buildBrandFilter(
      query.brand,
      publicMetadata,
      'user',
    );

    // Build match conditions
    const matchConditions: AssetMatchConditions = {
      isDeleted: QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted),
      parent,
    };

    // Add category filter if provided
    if (query.category) {
      matchConditions.category = query.category;
    }

    // Add parentModel filter if provided
    if (query.parentModel) {
      matchConditions.parentModel = query.parentModel;
    }

    // Add parent filter if provided
    if (query.parent) {
      matchConditions.parent = new Types.ObjectId(query.parent);
    }

    // Create secure aggregation pipeline
    const aggregate: PipelineStage[] = [
      {
        $match: matchConditions as PipelineStage.Match['$match'],
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

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
    // Validate ObjectId
    const validatedId = InputValidationUtil.validateObjectId(
      assetId,
      'assetId',
    );
    const publicMetadata = getPublicMetadata(user);

    // Find asset with ownership verification
    const asset = await this.assetsService.findOne({
      _id: validatedId,
      isDeleted: false,
      user: new Types.ObjectId(publicMetadata.user),
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
    const validatedId = InputValidationUtil.validateObjectId(
      assetId,
      'assetId',
    );
    const publicMetadata = getPublicMetadata(user);

    const existingAsset = await this.assetsService.findOne({
      _id: validatedId,
      isDeleted: false,
      user: new Types.ObjectId(publicMetadata.user),
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

    if (updateAssetDto.parentModel) {
      sanitizedUpdate.parentModel = InputValidationUtil.validateString(
        updateAssetDto.parentModel,
        'parentModel',
        { maxLength: 50 },
      ) as AssetParent;
    }

    if (updateAssetDto.parent) {
      ObjectIdUtil.validate(updateAssetDto.parent.toString(), 'parent');
      sanitizedUpdate.parent = updateAssetDto.parent;
    }

    if (updateAssetDto.isDeleted !== undefined) {
      sanitizedUpdate.isDeleted = updateAssetDto.isDeleted;
    }

    const isSettingAsLogoOrBanner =
      (updateAssetDto.category === AssetCategory.LOGO ||
        updateAssetDto.category === AssetCategory.BANNER) &&
      updateAssetDto.parent &&
      updateAssetDto.parentModel === AssetParent.BRAND;

    if (isSettingAsLogoOrBanner) {
      await this.assetsService.patchAll(
        {
          _id: { $ne: validatedId },
          category: updateAssetDto.category,
          isDeleted: false,
          parent: new Types.ObjectId(updateAssetDto.parent),
          parentModel: AssetParent.BRAND,
        },
        { isDeleted: true },
      );

      await this.cacheService.invalidateByTags([
        'brands',
        'links',
        'assets',
        'public',
      ]);

      if (updateAssetDto.parent) {
        try {
          await this.cacheService.del(`brand:${updateAssetDto.parent}`);
        } catch (_error) {
          // Ignore if key doesn't exist
        }
      }
    }

    const updatedAsset = await this.assetsService.patch(
      validatedId,
      sanitizedUpdate,
    );

    const userId = publicMetadata.user;
    if (
      userId &&
      updatedAsset &&
      [AssetCategory.LOGO, AssetCategory.BANNER].includes(
        updatedAsset.category,
      ) &&
      updatedAsset.parent
    ) {
      await this.websocketService.publishBrandRefresh(
        updatedAsset.parent.toString(),
        userId,
        {
          action: 'updated',
          assetId: updatedAsset._id.toString(),
          category: updatedAsset.category,
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
    const validatedId = InputValidationUtil.validateObjectId(
      assetId,
      'assetId',
    );
    const publicMetadata = getPublicMetadata(user);

    const existingAsset = await this.assetsService.findOne({
      _id: validatedId,
      isDeleted: false,
      user: new Types.ObjectId(publicMetadata.user),
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
