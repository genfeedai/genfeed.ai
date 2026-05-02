import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
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
  PostStatus,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { IngredientSerializer, PostSerializer } from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { PrismaWhereQuery } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

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
      isDeleted: false,
      scope: AssetScope.PUBLIC,
      status: PostStatus.PUBLIC,
    };

    // Filter by ingredient if provided
    if (ingredient && isEntityId(ingredient)) {
      matchQuery.ingredient = ingredient;
    }

    // Filter by brand if provided
    if (brand && isEntityId(brand)) {
      matchQuery.brand = brand;
    }

    // Filter by tag if provided (assuming tags are stored in metadata)
    if (tag) {
      matchQuery['metadata.tags'] = { mode: 'insensitive', contains: tag };
    }

    const aggregate = { where: matchQuery, orderBy: { createdAt: -1 } };

    const data = await this.postsService.findAll(aggregate, options);
    return serializeCollection(request, PostSerializer, data);
  }

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
    const post = await this.postsService.findOne({
      _id: postId,
      isDeleted: false,
      // scope: AssetScope.PUBLIC,
    });

    if (!post) {
      return returnNotFound(this.constructorName, postId);
    }

    return serializeSingle(request, PostSerializer, post);
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
      matchQuery.brand = brand;
    }

    // Filter by tag if provided
    if (tag) {
      matchQuery['metadata.tags'] = { mode: 'insensitive', contains: tag };
    }

    const aggregate = {
      where: matchQuery,
      orderBy: { createdAt: -1, totalPosts: -1 },
    };

    const data = await this.ingredientsService.findAll(aggregate, options);
    return serializeCollection(request, IngredientSerializer, data);
  }
}
