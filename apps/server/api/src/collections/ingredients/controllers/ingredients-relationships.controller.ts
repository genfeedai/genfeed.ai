import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientLineageQueryDto } from '@api/collections/ingredients/dto/ingredient-lineage-query.dto';
import { SetActiveIngredientVersionDto } from '@api/collections/ingredients/dto/set-active-ingredient-version.dto';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientLineageService } from '@api/collections/ingredients/services/ingredient-lineage.service';
import { IngredientStackService } from '@api/collections/ingredients/services/ingredient-stack.service';
import {
  type IngredientVersionHistoryResult,
  IngredientVersionsService,
  type IngredientVersionViewer,
} from '@api/collections/ingredients/services/ingredient-versions.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { API_KEY_MEDIA_WRITE_SCOPES } from '@api/helpers/utils/auth/api-key-route-scope-sets.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { IngredientLineageDirection } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  IngredientSerializer,
  MetadataSerializer,
  PostSerializer,
} from '@genfeedai/serializers';
import { getTenantContext } from '@libs/prisma/tenant-context';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

@AutoSwagger()
@Controller('ingredients')
@UseGuards(RolesGuard)
export class IngredientsRelationshipsController {
  private readonly constructorName: string = String(this.constructor.name);
  private postsService?: PostsService;

  constructor(
    private readonly ingredientsService: IngredientsService,
    private readonly lineageService: IngredientLineageService,
    private readonly versionsService: IngredientVersionsService,
    private readonly stackService: IngredientStackService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Lazy-load PostsService via ModuleRef to break circular dependency
   * IngredientsModule ↔ PostsModule
   */
  private getPostsService(): PostsService {
    const postsService =
      this.postsService ?? this.moduleRef.get(PostsService, { strict: false });

    if (!postsService) {
      throw new Error('PostsService not available');
    }

    this.postsService = postsService;
    return postsService;
  }

  /**
   * The carousel this asset belongs to, in slide order with the cover first
   * (see `IngredientStackService`). An asset in no carousel returns an empty
   * collection.
   */
  @Get(':ingredientId/stack')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findStack(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
  ): Promise<JsonApiCollectionResponse> {
    const ingredient = await this.ingredientsService.findOneSelect(
      { id: ingredientId },
      { organizationId: true },
    );

    if (!ingredient?.organizationId) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    const slideIds = await this.stackService.findSlideIds(
      ingredient.organizationId,
      ingredientId,
    );
    const data: AggregatePaginateResult<IngredientDocument> =
      await this.ingredientsService.findAll(
        {
          where: {
            id: { in: slideIds },
            isDeleted: false,
            organizationId: ingredient.organizationId,
          },
        },
        { customLabels, limit: Math.max(slideIds.length, 1), page: 1 },
      );
    const slideOrder = new Map(slideIds.map((id, index) => [id, index]));
    return serializeCollection(request, IngredientSerializer, {
      ...data,
      docs: [...data.docs].sort(
        (left, right) =>
          (slideOrder.get(left.id) ?? 0) - (slideOrder.get(right.id) ?? 0),
      ),
    });
  }

  @Get(':ingredientId/children')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findChildren(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const matchStage: Record<string, unknown> = {
      isDeleted,
      parentId: ingredientId,
      trainingId: null,
    };

    // Filter by favorite status if provided
    if (typeof query.isFavorite === 'boolean') {
      matchStage.isFavorite = query.isFavorite;
    }

    const aggregate = {
      where: matchStage,
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<IngredientDocument> =
      await this.ingredientsService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  @Get(':ingredientId/metadata')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMetadata(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
  ): Promise<JsonApiSingleResponse> {
    const data = await this.ingredientsService.findOne({ id: ingredientId }, [
      PopulatePatterns.metadataFull,
    ]);

    if (!data) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    return serializeSingle(request, MetadataSerializer, data.metadata);
  }

  /**
   * References this asset was made from (`sources`). Visibility follows the
   * Library, so this route does not use `AssetAccessGuard`: an asset the member
   * cannot list is a 404 here, not a 403 that confirms it exists.
   */
  @TenantReadPolicy('selected')
  @Get(':ingredientId/lineage/made-from')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMadeFrom(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @Query() query: IngredientLineageQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    return this.findLineage(
      request,
      ingredientId,
      IngredientLineageDirection.MADE_FROM,
      query,
      user,
      resolveTenantReadScope(user),
    );
  }

  /** Assets that used this one as a reference (`sourceOf`), newest first. */
  @TenantReadPolicy('selected')
  @Get(':ingredientId/lineage/used-in')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findUsedIn(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @Query() query: IngredientLineageQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    return this.findLineage(
      request,
      ingredientId,
      IngredientLineageDirection.USED_IN,
      query,
      user,
      resolveTenantReadScope(user),
    );
  }

  /**
   * The ordered versions of this asset and which one is active. Visibility
   * follows the Library like the lineage routes: the selected brand decides
   * which assets can be asked for, and a `USER` asset (the asked-for one or a
   * linked version) is shown to its owner only. An asset the member cannot see
   * is a 404.
   */
  @TenantReadPolicy('selected')
  @Get(':ingredientId/versions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findVersions(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const history = await this.versionsService.findHistory(
      ingredientId,
      this.versionViewer(user, resolveTenantReadScope(user)),
    );
    return this.serializeVersions(request, history);
  }

  /**
   * Makes one version of the history the active one. Nothing is deleted:
   * newer versions stay in the history and can be made active again.
   *
   * `AssetAccessGuard` has already decided who may change this asset, so the
   * lookup is not narrowed to the token's brand: the member may be viewing a
   * brand other than the one in the token, and still owns the asset.
   */
  @Patch(':ingredientId/versions/active')
  @RequiredScopes(...API_KEY_MEDIA_WRITE_SCOPES)
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async setActiveVersion(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @Body() body: SetActiveIngredientVersionDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const history = await this.versionsService.setActive(
      ingredientId,
      body.versionId,
      this.versionViewer(user, {
        brandId: undefined,
        organizationId: user.organizationId,
      }),
    );
    return this.serializeVersions(request, history);
  }

  private versionViewer(
    user: User,
    scope: Pick<ITenantReadScope, 'brandId' | 'organizationId'>,
  ): IngredientVersionViewer {
    return {
      brandId: scope.brandId,
      organizationId: scope.organizationId,
      userIds: [user.userId, user.id].filter((id): id is string => Boolean(id)),
    };
  }

  private serializeVersions(
    request: Request,
    { docs, ...history }: IngredientVersionHistoryResult,
  ): JsonApiCollectionResponse {
    return {
      ...serializeCollection(request, IngredientSerializer, { docs }),
      meta: history,
    };
  }

  private async findLineage(
    request: Request,
    ingredientId: string,
    direction: IngredientLineageDirection,
    query: IngredientLineageQueryDto,
    user: User,
    readScope?: ITenantReadScope,
  ): Promise<JsonApiCollectionResponse> {
    const { hiddenCount, ...page } = await this.lineageService.findLineage({
      direction,
      ingredientId,
      limit: query.limit,
      page: query.page,
      viewer: {
        brandId: readScope ? readScope.brandId : user.brandId,
        organizationId: readScope
          ? readScope.organizationId
          : user.organizationId,
      },
    });

    return {
      ...serializeCollection(request, IngredientSerializer, page),
      meta: { hiddenCount },
    };
  }

  @Get(':ingredientId/posts')
  @UseGuards(AssetAccessGuard)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findPosts(
    @Req() request: Request,
    @Param('ingredientId') ingredientId: string,
    @Query() query: BaseQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const ingredient = await this.ingredientsService.findOneSelect(
      { id: ingredientId },
      { organizationId: true },
    );

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate = {
      where: {
        ingredientLinks: { some: { ingredientId } },
        isDeleted,
        // Keep the scope explicit even for unowned shared ingredients because
        // `normalizeWhere` drops undefined values and would widen the query.
        // A platform ingredient (no organization) lists the requesting
        // organization's own posts that use it.
        organizationId:
          ingredient.organizationId ??
          getTenantContext()?.organizationId ??
          null,
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<unknown> =
      await this.getPostsService().findAll(aggregate, options);
    return serializeCollection(request, PostSerializer, data);
  }
}
