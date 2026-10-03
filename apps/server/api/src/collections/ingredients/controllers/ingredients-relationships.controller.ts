import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { IngredientLineageQueryDto } from '@api/collections/ingredients/dto/ingredient-lineage-query.dto';
import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientLineageService } from '@api/collections/ingredients/services/ingredient-lineage.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
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
    );
  }

  /** Assets that used this one as a reference (`sourceOf`), newest first. */
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
    );
  }

  private async findLineage(
    request: Request,
    ingredientId: string,
    direction: IngredientLineageDirection,
    query: IngredientLineageQueryDto,
    user: User,
  ): Promise<JsonApiCollectionResponse> {
    const { hiddenCount, ...page } = await this.lineageService.findLineage({
      direction,
      ingredientId,
      limit: query.limit,
      page: query.page,
      viewer: { brandId: user.brandId, organizationId: user.organizationId },
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
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
    });

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
        ingredients: { some: { id: ingredientId } },
        isDeleted,
        // Keep the scope explicit even for unowned shared ingredients because
        // `normalizeWhere` drops undefined values and would widen the query.
        organizationId: ingredient.organizationId ?? null,
      },
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<unknown> =
      await this.getPostsService().findAll(aggregate, options);
    return serializeCollection(request, PostSerializer, data);
  }
}
