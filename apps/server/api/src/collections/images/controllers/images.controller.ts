import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { User } from '@clerk/backend';
import { ActivityEntityModel, IngredientCategory } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('images')
@UseGuards(RolesGuard)
export class ImagesController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly imagesService: ImagesService,
    private readonly loggerService: LoggerService,
    private readonly votesService: VotesService,
  ) {}

  @Get('latest')
  @Cache({
    keyGenerator: (req) =>
      `images:latest:user:${req.user?.id ?? 'anonymous'}:limit:${req.query.limit ?? 10}`,
    tags: ['images'],
    ttl: 300, // 5 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findLatest(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query('limit') limit: number = 10,
  ): Promise<JsonApiCollectionResponse> {
    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(false);
    const scope = { not: null };
    const brand = publicMetadata.brand;

    const aggregate = {
      where: {
        AND: [
          {
            OR: [
              {
                AND: [
                  {
                    brand,
                    category: IngredientCategory.IMAGE,
                    isDeleted,
                    scope,
                    // Exclude training source images by default
                    training: { not: false },
                    user: publicMetadata.user,
                  },
                ],
              },
              {
                AND: [
                  {
                    // Filter default images by brand when brand is specified
                    brand,
                    category: IngredientCategory.IMAGE,
                    isDefault: true,
                    isDeleted,
                    scope,
                  },
                ],
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: -1 },
    };

    const data = await this.imagesService.findAll(aggregate, {
      limit: Math.min(Number(limit) || 10, 50),
      pagination: false,
    });

    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: ImagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const publicMetadata = getPublicMetadata(user);

    // Handle multiple status values (comma-separated)
    const status = QueryDefaultsUtil.parseStatusFilter(query.status);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Use CollectionFilterUtil for common filtering patterns
    const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
    const brand = CollectionFilterUtil.buildBrandFilter(
      query.brand,
      publicMetadata,
      'exists',
    );

    // const references = isEntityId(query.references)
    //   ? query.references
    //   : { not: null };

    // Use IngredientFilterUtil to build ingredient-specific filters
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parent,
    );

    const folderConditions = IngredientFilterUtil.buildFolderFilter(
      query.folder,
    );

    const trainingFilter = IngredientFilterUtil.buildTrainingFilter(
      query.training,
    );

    // Build isPublic filter for public gallery (getshareable.app)
    const isPublicFilter =
      query.isPublic !== undefined ? { isPublic: query.isPublic } : {};

    const aggregate = {
      where: {
        AND: [
          {
            OR: [
              {
                AND: [
                  {
                    OR: [
                      // User's own ingredients (when not filtering by isPublic)
                      ...(query.isPublic === undefined
                        ? [
                            { user: publicMetadata.user },
                            {
                              organization: publicMetadata.organization,
                            },
                          ]
                        : []),
                      // Public ingredients in user's organization (when isPublic=true)
                      ...(query.isPublic === true
                        ? [
                            {
                              isPublic: true,
                              organization: publicMetadata.organization,
                            },
                          ]
                        : []),
                    ],
                    category: IngredientCategory.IMAGE,
                    isDeleted,
                    ...(query.isPublic === undefined ? { scope } : {}),
                    brand,
                    status,
                    ...isPublicFilter,
                    // references,
                  },
                  folderConditions,
                  trainingFilter,
                  ...(Object.keys(parentConditions).length > 0
                    ? [parentConditions]
                    : []),
                ],
              },
              // Default images (only when not filtering by isPublic)
              ...(query.isPublic === undefined
                ? [
                    {
                      AND: [
                        {
                          category: IngredientCategory.IMAGE,
                          isDefault: true,
                          isDeleted,
                          status,
                          // Filter default images by brand when brand is specified
                          ...(isEntityId(query.brand) ? { brand } : {}),
                          // references,
                        },
                        folderConditions,
                        ...(Object.keys(parentConditions).length > 0
                          ? [parentConditions]
                          : []),
                      ],
                    },
                  ]
                : []),
            ],
          },
        ],
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data = await this.imagesService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    const aggregatedData: Record<string, unknown> = { evaluation: null };

    const data = await this.imagesService.findOne(
      {
        _id: imageId,
        isDeleted: false,
        organization: publicMetadata.organization,
      },
      [
        PopulatePatterns.metadataFull,
        PopulatePatterns.promptFull,
        PopulatePatterns.brandMinimal,
        PopulatePatterns.organizationMinimal,
      ],
    );

    if (!data) {
      return returnNotFound(this.constructorName, imageId);
    }

    // Merge evaluation from aggregation into populated data
    const dataRecord =
      data &&
      typeof data === 'object' &&
      'toObject' in data &&
      typeof (data as { toObject?: unknown }).toObject === 'function'
        ? ((
            data as unknown as { toObject: () => unknown }
          ).toObject() as Record<string, unknown>)
        : (data as unknown as Record<string, unknown>);
    const mergedData: Record<string, unknown> = {
      ...dataRecord,
      evaluation: aggregatedData.evaluation,
    };

    const vote = await this.votesService.findOne({
      entity: imageId,
      entityModel: ActivityEntityModel.INGREDIENT,
      isDeleted: false,
      user: publicMetadata.user,
    });

    mergedData.hasVoted = !!vote;

    return serializeSingle(request, IngredientSerializer, mergedData);
  }

  @Delete(':imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @Param('imageId') imageId: string,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.imagesService.remove(imageId);
    return data
      ? serializeSingle(request, IngredientSerializer, data)
      : returnNotFound(this.constructorName, imageId);
  }
}
