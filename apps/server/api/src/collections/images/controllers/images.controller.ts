import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { EntityIdUtil } from '@api/helpers/utils/entity-id/entity-id.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import { scopedWhere } from '@api/index';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
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

  @Get()
  // Cache only the `latest=true` shorthand (formerly GET /images/latest): the
  // general image list is intentionally uncached to keep freshly generated
  // images visible immediately. The keyGenerator returns '' for non-latest
  // requests, which the RedisCacheInterceptor treats as "do not cache".
  @Cache({
    keyGenerator: (req) =>
      req.query.latest === 'true'
        ? `images:latest:org:${(req.user?.organizationId as string | undefined) ?? 'global'}:brand:${(req.user?.brandId as string | undefined) ?? 'global'}:user:${req.user?.id ?? 'anonymous'}:limit:${req.query.limit ?? 10}`
        : '',
    tags: ['images'],
    ttl: 300, // 5 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: ImagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { query });

    const imageCategory = CategoryPrismaUtil.toIngredientCategory(
      IngredientCategory.IMAGE,
    );

    // `latest=true` shorthand for brand-scoped user images with training sources
    // excluded, plus the org's brand-default images, ordered by createdAt desc
    // and capped at 50. Bypasses the standard list filters entirely.
    if (query.latest) {
      return this.findLatest(request, user, query, imageCategory);
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    // Handle multiple status values (comma-separated)
    const status = QueryDefaultsUtil.parseStatusFilter(query.status);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Use CollectionFilterUtil for common filtering patterns
    const scope = CollectionFilterUtil.buildScopeFilter(query.scope);
    const brandId = CollectionFilterUtil.buildBrandFilter(
      query.brandId,
      user,
      'exists',
    );

    // Use IngredientFilterUtil to build ingredient-specific filters
    const parentConditions = IngredientFilterUtil.buildParentFilter(
      query.parentId,
    );

    const folderConditions = IngredientFilterUtil.buildFolderFilter(
      query.folderId,
    );

    const trainingFilter = IngredientFilterUtil.buildTrainingFilter(
      query.trainingId,
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
                    organizationId: user.organizationId,
                    category: imageCategory,
                    isDeleted,
                    ...(query.isPublic === undefined && scope !== undefined
                      ? { scope }
                      : {}),
                    brandId,
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
                          category: imageCategory,
                          isDefault: true,
                          isDeleted,
                          OR: [
                            {
                              organizationId: user.organizationId,
                            },
                            { organizationId: null },
                          ],
                          status,
                          // Filter default images by brand when brand is specified
                          ...(isEntityId(query.brandId) ? { brandId } : {}),
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

  private async findLatest(
    request: Request,
    user: User,
    query: ImagesQueryDto,
    imageCategory: ReturnType<typeof CategoryPrismaUtil.toIngredientCategory>,
  ): Promise<JsonApiCollectionResponse> {
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(false);
    const aggregate = {
      where: {
        AND: [
          {
            OR: [
              {
                AND: [
                  {
                    brandId: user.brandId,
                    category: imageCategory,
                    isDeleted,
                    organizationId: user.organizationId,
                    trainingId: null,
                    userId: user.userId ?? user.id,
                  },
                ],
              },
              {
                AND: [
                  {
                    brandId: user.brandId,
                    category: imageCategory,
                    isDefault: true,
                    isDeleted,
                    OR: [
                      { organizationId: user.organizationId },
                      { organizationId: null },
                    ],
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
      limit: Math.min(Number(query.limit) || 10, 50),
      page: 1,
      pagination: true,
    });
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const aggregatedData: Record<string, unknown> = { evaluation: null };

    const data = await this.imagesService.findOne(
      {
        id: imageId,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        OR: [
          { organizationId: user.organizationId },
          { isDefault: true, organizationId: null },
        ],
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
      entityId: imageId,
      entityModel: ActivityEntityModel.INGREDIENT,
      userId: user.userId ?? user.id,
    });

    mergedData.hasVoted = !!vote;

    return serializeSingle(request, IngredientSerializer, mergedData);
  }

  @Delete(':imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const image = await this.imagesService.findOne(
      scopedWhere(user.organizationId, {
        id: imageId,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
      }),
    );

    if (!image) {
      return returnNotFound(this.constructorName, imageId);
    }

    const canonicalImageId = EntityIdUtil.resolveCanonicalId(image, imageId);
    const data = await this.imagesService.remove(canonicalImageId);
    return data
      ? serializeSingle(request, IngredientSerializer, data)
      : returnNotFound(this.constructorName, imageId);
  }
}
