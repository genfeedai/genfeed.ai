import { type IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
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
    private readonly moduleRef: ModuleRef,
  ) {}

  /**
   * Lazy-load PostsService via ModuleRef to break circular dependency
   * IngredientsModule ↔ PostsModule
   */
  private getPostsService(): PostsService {
    if (!this.postsService) {
      this.postsService = this.moduleRef.get(PostsService, { strict: false });
    }
    return this.postsService;
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
    const matchStage: unknown = {
      isDeleted,
      parent: ingredientId,
      training: { $exists: false },
    };

    // Filter by favorite status if provided
    if (typeof query.isFavorite === 'boolean') {
      matchStage.isFavorite = query.isFavorite;
    }

    const aggregate: Record<string, unknown>[] = [
      {
        $match: matchStage,
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

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
    const data = await this.ingredientsService.findOne({ _id: ingredientId }, [
      PopulatePatterns.metadataFull,
    ]);

    if (!data) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    return serializeSingle(request, MetadataSerializer, data.metadata);
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
      _id: ingredientId,
      isDeleted: false,
    });

    if (!ingredient) {
      return returnNotFound(this.constructorName, ingredientId);
    }

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          ingredients: ingredientId,
          isDeleted,
          organization: ingredient.organization,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<unknown> =
      await this.getPostsService().findAll(aggregate, options);
    return serializeCollection(request, PostSerializer, data);
  }
}
