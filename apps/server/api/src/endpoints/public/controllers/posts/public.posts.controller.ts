import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  postExecutionStateReadFilter,
  postVisibilityReadFilter,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  IngredientSerializer,
  PublicPostSerializer,
} from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { PrismaWhereQuery } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

/**
 * A post is public only while its brand is: a private brand's posts stay off
 * Genfeed even when they are live on a social network, so a brand id cannot
 * be used to list the posts of a profile that is not public. The relation
 * filter is not enum-normalized by BaseService, so the scope is the Prisma
 * label.
 */
const PUBLIC_BRAND_FILTER = {
  brand: {
    is: {
      isDeleted: false,
      scope: CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC),
    },
  },
};

@AutoSwagger()
@Public()
@Controller('public/posts')
export class PublicPostsController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly postsService: PostsService,
    private readonly ingredientsService: IngredientsService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => `public:posts:${JSON.stringify(req.query)}`,
    tags: ['posts', 'public'],
    ttl: 600, // 10 minutes
  })
  async findPublicPosts(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
    @Query('tag') tag?: string,
    @Query('brand') brand?: string,
    @Query('ingredient') ingredient?: string,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchQuery: PrismaWhereQuery = {
      AND: [
        postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        postVisibilityReadFilter(PostVisibility.PUBLIC),
      ],
      isDeleted: false,
      ...PUBLIC_BRAND_FILTER,
    };

    // Filter by ingredient if provided
    if (ingredient && isEntityId(ingredient)) {
      matchQuery.OR = [
        { entityIngredientId: ingredient },
        { ingredientLinks: { some: { ingredientId: ingredient } } },
      ];
    }

    // Filter by brand if provided
    if (brand && isEntityId(brand)) {
      matchQuery.brandId = brand;
    }

    // Filter by related tag label.
    if (tag) {
      matchQuery.tags = {
        some: { label: { contains: tag, mode: 'insensitive' } },
      };
    }

    const aggregate = { where: matchQuery, orderBy: { createdAt: -1 } };

    const data = await this.postsService.findAll(aggregate, options);
    return serializeCollection(request, PublicPostSerializer, data);
  }

  @Get('ingredients')
  @Cache({
    keyGenerator: (req) =>
      `public:posts:ingredients:${JSON.stringify(req.query)}`,
    tags: ['ingredients', 'posts', 'public'],
    ttl: 600, // 10 minutes
  })
  async findPublicIngredients(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('tag') tag?: string,
  ): Promise<JsonApiCollectionResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.logger.log(url, { query });

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const matchQuery: PrismaWhereQuery = {
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: IngredientStatus.GENERATED,
    };

    // Filter by category if provided
    if (
      category &&
      Object.values(IngredientCategory).includes(category as IngredientCategory)
    ) {
      matchQuery.category = category;
    }

    // Filter by brand if provided
    if (brand && isEntityId(brand)) {
      matchQuery.brandId = brand;
    }

    // Filter by tag if provided
    if (tag) {
      matchQuery.tags = {
        some: { label: { contains: tag, mode: 'insensitive' } },
      };
    }

    // `totalPosts` was computed by the former Mongo aggregation and is not an
    // Ingredient scalar. The Prisma schema now exposes two distinct post
    // relations, neither of whose unfiltered relation count preserves that
    // public-post metric. Keep the endpoint newest-first and use `id` as the
    // stable tiebreaker until a canonical popularity projection exists.
    const aggregate = {
      where: matchQuery,
      orderBy: [{ createdAt: -1 }, { id: -1 }],
    };

    const data = await this.ingredientsService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }

  // Wildcard param routes — keep last. Nest matches in declaration order, so a
  // `:postId` route declared earlier swallows every static sibling path
  // (`GET /public/posts/ingredients` would resolve to getPostMetadata).

  @Get(':postId')
  @Cache({
    keyGenerator: (req) => `public:post:${req.params?.postId ?? 'unknown'}`,
    tags: ['posts'],
    ttl: 1800, // 30 minutes
  })
  async getPostMetadata(
    @Req() request: Request,
    @Param('postId') postId: string,
  ): Promise<JsonApiSingleResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!isEntityId(postId)) {
      return returnNotFound(this.constructorName, postId);
    }

    this.logger.log(url, { params: { postId } });
    // Public detail uses the same independent lifecycle and audience filters
    // as the list endpoint above.
    const post = await this.postsService.findOne(
      {
        AND: [
          postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
          postVisibilityReadFilter(PostVisibility.PUBLIC),
        ],
        id: postId,
        ...PUBLIC_BRAND_FILTER,
      },
      [],
    );

    if (!post) {
      return returnNotFound(this.constructorName, postId);
    }

    return serializeSingle(request, PublicPostSerializer, post);
  }
}
