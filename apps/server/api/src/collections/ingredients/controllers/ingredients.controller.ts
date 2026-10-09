import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ContentEvaluationProjectionService } from '@api/collections/evaluations/services/content-evaluation-projection.service';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { UpdateIngredientDto } from '@api/collections/ingredients/dto/update-ingredient.dto';
import {
  IngredientCharacterFilterService,
  resolveCharacterFilter,
} from '@api/collections/ingredients/services/ingredient-character-filter.service';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { LibraryShelfUtil } from '@api/helpers/utils/library-shelf/library-shelf.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { scopedWhere } from '@api/index';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import type {
  ILibrarySummary,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { IngredientSerializer } from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { resolveIngredientMediaUrl } from '@libs/media/media-url.util';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly foldersService: FoldersService,
    private readonly cancellationService: IngredientGenerationCancellationService,
    private readonly configService: ConfigService,
    private readonly mediaUrlService: MediaUrlService,
    @Optional()
    private readonly evaluationProjection?: ContentEvaluationProjectionService,
    @Optional()
    private readonly characterFilter?: IngredientCharacterFilterService,
  ) {}

  /**
   * Unified Library list — every asset category in one query.
   *
   * The Library has three orthogonal axes and this endpoint composes all of
   * them: `categories` (what it is), `shelf` (where it is in its own
   * generation), and `folderId` (where a human filed it). None of the three
   * replaces another.
   */
  @Get()
  @Cache({
    keyGenerator: (req) => {
      const tenant = CollectionFilterUtil.resolveListCacheScope(req);
      return `ingredients:list:org:${tenant.organizationId || 'global'}:sessionOrg:${req.user?.organizationId ?? 'global'}:brand:${req.user?.brandId ?? 'global'}:user:${req.user?.userId ?? req.user?.id ?? 'anonymous'}:query:${JSON.stringify(req.query)}`;
    },
    tags: ['ingredients'],
    ttl: 60,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({ summary: 'List Library assets across every category' })
  @ApiResponse({ description: 'Library assets returned', status: 200 })
  async findAll(
    @Req() request: Request,
    @Query() query: IngredientsQueryDto,
    @CurrentUser() user: User,
  ) {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const brandId = tenant.isOrganizationOverride
      ? tenant.brandId
      : CollectionFilterUtil.buildAuthorizedBrandFilter(
          query.brandId,
          user,
          getIsSuperAdmin(user, request),
        );

    // `categories` is the multi-select Library type axis; `category` stays for
    // single-type callers. Both normalize to Prisma labels.
    const categories = (query.categories ?? []).map((category) =>
      CategoryPrismaUtil.toIngredientCategory(category),
    );
    const categoryFilter = CollectionFilterUtil.buildCategoryFilter(
      categories.length > 0
        ? categories
        : CategoryPrismaUtil.toIngredientCategory(query.category),
    );

    const searchFilter = CollectionFilterUtil.buildSearchFilter(query.search, [
      'metadata.label',
      'metadata.description',
      'prompt.prompt',
    ]);

    const characterFilter = await resolveCharacterFilter(this.characterFilter, {
      characterIds: query.characters,
      explicitBrandId: typeof brandId === 'string' ? brandId : undefined,
      user: tenant.isOrganizationOverride
        ? {
            ...user,
            organizationId: tenant.organizationId,
            brandId: tenant.brandId ?? '',
          }
        : user,
    });

    const aggregate = {
      include: IngredientFilterUtil.buildLibraryListInclude(),
      orderBy: Object.entries(handleQuerySort(query.sort)).map(
        ([field, direction]) =>
          field === 'label'
            ? { metadata: { label: direction } }
            : { [field]: direction },
      ),
      where: {
        // `isDeleted` stays at the top level: BaseService.withSoftDeleteFilter
        // only honours an explicit value it can see there, and would otherwise
        // prepend `isDeleted: false` and make the Trash place always empty.
        isDeleted: QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted),
        AND: [
          { organizationId: tenant.organizationId },
          brandId ? { brandId } : {},
          categoryFilter,
          // A selected shelf owns the status axis outright.
          LibraryShelfUtil.buildShelfFilter(query.shelf),
          LibraryShelfUtil.buildStatusFilter(
            query.status,
            query.shelf,
            query.isDeleted === true,
          ),
          LibraryShelfUtil.buildPlaceFilter(query.isFavorite),
          IngredientFilterUtil.buildFolderFilter(query.folderId?.toString()),
          IngredientFilterUtil.buildParentFilter(query.parentId?.toString()),
          IngredientFilterUtil.buildOriginFilter(query.origins),
          characterFilter,
          IngredientFilterUtil.buildTagFilter(query.tags, query.tagMatch),
          searchFilter.where,
        ],
      },
    };

    const data = await this.ingredientsService.findAll(aggregate, options);
    return serializeCollection(
      request,
      IngredientSerializer,
      (await this.evaluationProjection?.attachToPage(data, {
        brandId: tenant.isOrganizationOverride ? tenant.brandId : user.brandId,
      })) ?? data,
    );
  }

  /**
   * Library sidebar counters: per-category totals, per-shelf counts, starred,
   * trashed, and total bytes stored.
   *
   * Shelf counts overlap by design — each is the size of its own saved query,
   * so they never sum to `total`.
   */
  @Get('summary')
  @Cache({
    keyGenerator: (req) => {
      const tenant = CollectionFilterUtil.resolveListCacheScope(req);
      return `ingredients:summary:org:${tenant.organizationId || 'global'}:sessionOrg:${req.user?.organizationId ?? 'global'}:brand:${req.user?.brandId ?? 'global'}:user:${req.user?.userId ?? req.user?.id ?? 'anonymous'}:query:${JSON.stringify(req.query)}`;
    },
    tags: ['ingredients'],
    ttl: 60,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({ summary: 'Library summary counters for the sidebar' })
  @ApiResponse({ description: 'Library summary returned', status: 200 })
  async getSummary(
    @Req() request: Request,
    @Query() query: IngredientsQueryDto,
    @CurrentUser() user: User,
  ): Promise<ILibrarySummary> {
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    // Counters follow the same brand scope as the list: an explicit brand when
    // asked for, otherwise the caller's brand, otherwise any branded asset.
    const brandId = tenant.isOrganizationOverride
      ? tenant.brandId
      : CollectionFilterUtil.buildAuthorizedBrandFilter(
          query.brandId,
          user,
          getIsSuperAdmin(user, request),
        );
    const brandFilter: Prisma.IngredientWhereInput = brandId ? { brandId } : {};

    return this.ingredientsService.getLibrarySummary(
      tenant.organizationId,
      brandFilter,
    );
  }

  @TenantReadPolicy('selected')
  @Get('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get multiple ingredients by ID' })
  @ApiResponse({ description: 'Batch ingredients returned', status: 200 })
  async getBatch(
    @Req() request: Request,
    @Query('ids') idsParam: string,
    @CurrentUser() user: User,
  ) {
    const readScope = resolveTenantReadScope(user);
    if (!idsParam || idsParam.trim().length === 0) {
      throw new BadRequestException('ids query parameter is required');
    }

    const ids = idsParam
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 50);

    if (ids.length === 0) {
      throw new BadRequestException('At least one valid ID is required');
    }

    const ingredients = await this.ingredientsService.findByIds(
      ids,
      readScope.organizationId,
    );
    const cdnOrigin = this.configService.ingredientsEndpoint.replace(
      /\/ingredients\/?$/,
      '',
    );
    // The computed `cdnUrl` already covers `s3Key`; resolving here adds the
    // `metadata.result` fallback for provider-hosted and external media.
    const renderableIngredients = ingredients.map((ingredient) => {
      const resolvedUrl = resolveIngredientMediaUrl(ingredient, cdnOrigin);
      // `findByIds` loads only `metadata.result` to resolve the URL; it is not
      // part of the batch response.
      const { metadata: _metadata, ...rest } = ingredient;

      return {
        ...rest,
        cdnUrl: resolvedUrl
          ? this.mediaUrlService.buildUrlFromAbsolute(resolvedUrl)
          : null,
      };
    });

    return serializeCollection(request, IngredientSerializer, {
      docs: renderableIngredients,
    });
  }

  /**
   * Superadmin-only cross-tenant generation ledger. Library `findAll` stays
   * organization-scoped; this path is the one place operators can inspect
   * another tenant's original, enhanced, and compiled prompts next to the
   * result image (#5763).
   */
  @Get('admin/generation-reviews')
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    summary:
      'List generated images with original, enhanced, and compiled prompts',
  })
  @ApiResponse({ description: 'Generation reviews returned', status: 200 })
  async listAdminGenerationReviews(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ) {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const data = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: superadmin generation review (#5763) is a read-only cross-tenant ledger of original/enhanced/compiled prompts plus result images; Library findAll stays organization-scoped
        await this.ingredientsService.findAll(
          {
            include: {
              metadata: true,
              organization: true,
              prompt: true,
              user: true,
            },
            orderBy: handleQuerySort(query.sort),
            where: {
              category: IngredientCategory.IMAGE,
              isDeleted: false,
              status: {
                in: [IngredientStatus.FAILED, IngredientStatus.GENERATED],
              },
            },
          },
          options,
        ),
    );

    return serializeCollection(request, IngredientSerializer, data);
  }

  @Patch(':ingredientId')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
    @Body() updateIngredientDto: UpdateIngredientDto,
  ): Promise<JsonApiSingleResponse> {
    const processedDto = {
      ...(updateIngredientDto as unknown as Record<string, unknown>),
    };

    // Load only an active ingredient in the caller organization, then enforce
    // current-brand or organization-shared access below.
    const ingredient = await this.ingredientsService.findOne(
      scopedWhere(user.organizationId, { id: ingredientId }),
      [PopulatePatterns.metadataFull],
    );

    if (
      !ingredient ||
      (ingredient.brandId && ingredient.brandId.toString() !== user.brandId)
    ) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    if (
      Object.hasOwn(processedDto, 'folderId') &&
      processedDto.folderId !== null
    ) {
      const folder = await this.foldersService.findOne(
        scopedWhere(user.organizationId, {
          id: processedDto.folderId,
        }),
      );

      if (
        !folder ||
        (folder.brandId && folder.brandId.toString() !== user.brandId)
      ) {
        return returnNotFound(
          this.constructorName,
          String(processedDto.folderId),
        );
      }
    }

    if (updateIngredientDto.tags) {
      await this.ingredientsService.assertClientTags(
        updateIngredientDto.tags,
        user.organizationId,
        ingredient.brandId,
      );
    }

    await this.ingredientsService.patch(
      ingredientId,
      processedDto as unknown as UpdateIngredientDto,
    );

    // Fetch the updated document with populated fields
    // Only populate metadata fully and brand minimally (id, label, handle)
    const data = await this.ingredientsService.findOne(
      scopedWhere(user.organizationId, { id: ingredientId }),
      [PopulatePatterns.metadataFull, PopulatePatterns.brandMinimal],
    );

    return serializeSingle(request, IngredientSerializer, data);
  }

  @Post(':ingredientId/cancellations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'IngredientsController.cancelGeneration',
    summary: 'Cancel an in-flight studio generation',
  })
  @ApiResponse({ description: 'Generation cancelled', status: 200 })
  async cancelGeneration(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const ingredient =
      await this.cancellationService.cancelProcessingIngredient({
        id: ingredientId,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      });

    return serializeSingle(request, IngredientSerializer, ingredient);
  }
}
