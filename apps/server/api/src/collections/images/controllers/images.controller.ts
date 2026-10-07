import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentEvaluationProjectionService } from '@api/collections/evaluations/services/content-evaluation-projection.service';
import { buildImageListAggregate } from '@api/collections/images/controllers/image-list-query.util';
import { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientCharacterFilterService } from '@api/collections/ingredients/services/ingredient-character-filter.service';
import { VotesService } from '@api/collections/votes/services/votes.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
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
import { scopedWhere } from '@api/index';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { ActivityEntityModel, IngredientCategory } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { IngredientSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Controller,
  Delete,
  Get,
  Optional,
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
    @Optional()
    private readonly evaluationProjection?: ContentEvaluationProjectionService,
    @Optional()
    private readonly characterFilter?: IngredientCharacterFilterService,
  ) {}

  @Get()
  // Cache only the `latest=true` shorthand (formerly GET /images/latest): the
  // general image list is intentionally uncached to keep freshly generated
  // images visible immediately. The keyGenerator returns '' for non-latest
  // requests, which the RedisCacheInterceptor treats as "do not cache".
  @Cache({
    keyGenerator: (req) => {
      if (req.query.latest !== 'true') return '';
      const tenant = CollectionFilterUtil.resolveListCacheScope(req);
      return `images:latest:org:${tenant.organizationId || 'global'}:sessionOrg:${req.user?.organizationId ?? 'global'}:brand:${req.user?.brandId ?? 'global'}:user:${req.user?.userId ?? req.user?.id ?? 'anonymous'}:query:${JSON.stringify(req.query)}`;
    },
    tags: ['images'],
    ttl: 300, // 5 minutes
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Query() query: ImagesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
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

    const aggregate = await buildImageListAggregate(
      query,
      user,
      tenant,
      imageCategory,
      this.characterFilter,
    );

    const data = await this.imagesService.findAll(aggregate, options);
    return serializeCollection(
      request,
      IngredientSerializer,
      (await this.evaluationProjection?.attachToPage(data, {
        brandId: tenant.isOrganizationOverride ? tenant.brandId : user.brandId,
        contentType: 'image',
      })) ?? data,
    );
  }

  private async findLatest(
    request: Request,
    user: User,
    query: ImagesQueryDto,
    imageCategory: ReturnType<typeof CategoryPrismaUtil.toIngredientCategory>,
  ): Promise<JsonApiCollectionResponse> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    const brandId = tenant.isOrganizationOverride
      ? tenant.brandId
      : user.brandId;
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(false);
    const aggregate = {
      where: {
        AND: [
          {
            OR: [
              {
                AND: [
                  {
                    ...(brandId ? { brandId } : {}),
                    category: imageCategory,
                    isDeleted,
                    organizationId: tenant.organizationId,
                    trainingId: null,
                    ...(!tenant.isOrganizationOverride
                      ? { userId: user.userId ?? user.id }
                      : {}),
                  },
                ],
              },
              {
                AND: [
                  {
                    ...(brandId ? { brandId } : {}),
                    category: imageCategory,
                    isDefault: true,
                    isDeleted,
                    OR: [
                      { organizationId: tenant.organizationId },
                      { organizationId: null },
                    ],
                  },
                ],
              },
            ],
          },
          IngredientFilterUtil.buildOriginFilter(query.origins),
        ],
      },
      orderBy: { createdAt: -1 },
    };
    const data = await this.imagesService.findAll(aggregate, {
      limit: Math.min(Number(query.limit) || 10, 50),
      page: 1,
      pagination: true,
    });
    return serializeCollection(
      request,
      IngredientSerializer,
      (await this.evaluationProjection?.attachToPage(data, {
        brandId: tenant.isOrganizationOverride ? tenant.brandId : user.brandId,
        contentType: 'image',
      })) ?? data,
    );
  }

  @TenantReadPolicy('selected')
  @Get(':imageId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('imageId') imageId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const readScope = resolveTenantReadScope(user);
    const data = await this.imagesService.findOne(
      {
        id: imageId,
        isDeleted: false,
        category: CategoryPrismaUtil.toIngredientCategory(
          IngredientCategory.IMAGE,
        ),
        OR: [
          { organizationId: readScope.organizationId },
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
    };

    // Ingredient votes are written with the voter's organization.
    const vote = await this.votesService.findOne({
      entityId: imageId,
      entityModel: ActivityEntityModel.INGREDIENT,
      isDeleted: false,
      organizationId: readScope.organizationId,
      userId: user.userId ?? user.id,
    });

    mergedData.hasVoted = !!vote;

    return serializeSingle(
      request,
      IngredientSerializer,
      (await this.evaluationProjection?.attachToItem(mergedData, {
        brandId: readScope.brandId,
        contentType: 'image',
      })) ?? mergedData,
    );
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
