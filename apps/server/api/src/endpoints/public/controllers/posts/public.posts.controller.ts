import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { orderedPostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import {
  type CrossPostCandidate,
  findCrossPostIds,
  listCrossPosts,
} from '@api/endpoints/public/utils/public-cross-posts.util';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { PUBLIC_BRAND_FILTER } from '@api/helpers/utils/public-brand/public-brand-filter.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  AssetScope,
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
  isPlatform,
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

/** A public post renders with its media in order and links to its creator. */
const PUBLIC_POST_INCLUDE = {
  brand: { select: { id: true, label: true, slug: true } },
  ingredientLinks: orderedPostIngredientLinks({
    select: {
      category: true,
      height: true,
      id: true,
      isDeleted: true,
      s3Key: true,
      status: true,
      width: true,
    },
  }),
};

/** Native posts compared when pairing a profile's cross-posts. */
const CROSS_POST_NATIVE_LIMIT = 200;
/** Network posts compared against them. */
const CROSS_POST_NETWORK_LIMIT = 1000;

const CROSS_POST_SELECT = {
  createdAt: true,
  description: true,
  id: true,
  platform: true,
  publishedAt: true,
  url: true,
} as const;

function publicPublishedWhere(brandId: string): PrismaWhereQuery {
  return {
    AND: [
      postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
      postVisibilityReadFilter(PostVisibility.PUBLIC),
    ],
    brandId,
    isDeleted: false,
    parentId: null,
  };
}

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
    @Query('platform') platform?: string,
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

    // Filter by brand if provided. A creator's profile lists each post once:
    // a network copy of a post that also went to the Genfeed profile is
    // shown through the native post.
    if (brand && isEntityId(brand)) {
      matchQuery.brandId = brand;
      const crossPostIds = await this.findBrandCrossPostIds(brand);
      if (crossPostIds.length > 0) {
        matchQuery.id = { notIn: crossPostIds };
      }
    }

    if (platform && isPlatform(platform)) {
      matchQuery.platform = platform;
    }

    // Filter by related tag label.
    if (tag) {
      matchQuery.tags = {
        some: { label: { contains: tag, mode: 'insensitive' } },
      };
    }

    const aggregate = {
      include: PUBLIC_POST_INCLUDE,
      orderBy: { createdAt: -1 },
      where: matchQuery,
    };

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
    keyGenerator: (req) =>
      `public:post:${req.params?.postId ?? 'unknown'}:brand:${req.query?.brand ?? ''}`,
    tags: ['posts'],
    ttl: 1800, // 30 minutes
  })
  async getPostMetadata(
    @Req() request: Request,
    @Param('postId') postId: string,
    @Query('brand') brand?: string,
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
        // A creator page names its brand, so another creator's post id
        // answers 404 under the wrong handle.
        ...(brand && isEntityId(brand) ? { brandId: brand.trim() } : {}),
      },
      ['ingredients', 'brand'],
    );

    if (!post) {
      return returnNotFound(this.constructorName, postId);
    }

    const crossPosts =
      post.platform === CredentialPlatform.GENFEED
        ? await this.findCrossPosts(post)
        : [];

    return serializeSingle(request, PublicPostSerializer, {
      ...post,
      crossPosts,
    });
  }

  /** Public network posts of a brand that copy one of its native posts. */
  private async findBrandCrossPostIds(brandId: string): Promise<string[]> {
    const natives: CrossPostCandidate[] =
      // tenant-scope-ignore: public profile read; publicPublishedWhere pins one public brand and isDeleted: false.
      await this.postsService.prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        select: CROSS_POST_SELECT,
        take: CROSS_POST_NATIVE_LIMIT,
        where: {
          ...publicPublishedWhere(brandId),
          platform: CredentialPlatform.GENFEED,
        },
      });
    if (natives.length === 0) {
      return [];
    }
    const networkPosts: CrossPostCandidate[] =
      // tenant-scope-ignore: public profile read; publicPublishedWhere pins one public brand and isDeleted: false.
      await this.postsService.prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        select: CROSS_POST_SELECT,
        take: CROSS_POST_NETWORK_LIMIT,
        where: {
          ...publicPublishedWhere(brandId),
          platform: { not: CredentialPlatform.GENFEED },
        },
      });
    return findCrossPostIds(natives, networkPosts);
  }

  /** Where a native post also went live. */
  private async findCrossPosts(
    post: CrossPostCandidate & { brandId?: string },
  ) {
    if (!post.brandId) {
      return [];
    }
    const networkPosts: CrossPostCandidate[] =
      // tenant-scope-ignore: public profile read; publicPublishedWhere pins one public brand and isDeleted: false.
      await this.postsService.prisma.post.findMany({
        orderBy: { createdAt: 'desc' },
        select: CROSS_POST_SELECT,
        take: CROSS_POST_NETWORK_LIMIT,
        where: {
          ...publicPublishedWhere(post.brandId),
          platform: { not: CredentialPlatform.GENFEED },
          url: { not: null },
        },
      });
    return listCrossPosts(post, networkPosts);
  }
}
