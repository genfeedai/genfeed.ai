import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PUBLISHED_AND_LIVE_WHERE } from '@api/collections/posts/services/post-inbox-delivery.filter';
import { orderedPostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { CACHE_TAGS } from '@api/common/constants/cache-patterns.constants';
import {
  type CrossPostCandidate,
  findCrossPostIds,
  listCrossPosts,
} from '@api/endpoints/public/utils/public-cross-posts.util';
import { PUBLIC_POSTS_ORDER_BY } from '@api/endpoints/public/utils/public-posts-order.util';
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
import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  AssetScope,
  CredentialPlatform,
  IngredientCategory,
  IngredientStatus,
  isPlatform,
  PostVisibility,
} from '@genfeedai/contracts';
import { postVisibilityReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
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
      id: true,
      isDeleted: true,
      // Frame size lives on the metadata row; `Ingredient` has no width or
      // height column, so selecting them on it fails Prisma validation.
      metadata: { select: { height: true, width: true } },
      s3Key: true,
      status: true,
    },
  }),
};

interface PublicPostMedia {
  metadata?: { height?: number; width?: number } | null;
}

/**
 * Lifts the frame size from the media's metadata row onto the media itself,
 * the shape the public post serializer reads. Media without a metadata row
 * carries no dimensions.
 */
function withMediaDimensions<T extends PublicPostMedia>(media: T): T {
  const { metadata, ...rest } = media;
  return {
    ...rest,
    ...(metadata ? { height: metadata.height, width: metadata.width } : {}),
  } as unknown as T;
}

function withPublicMediaDimensions<D extends object>(
  data: AggregatePaginateResult<D>,
): AggregatePaginateResult<D> {
  return {
    ...data,
    docs: data.docs.map((post) => {
      const { ingredients } = post as { ingredients?: unknown };
      return Array.isArray(ingredients)
        ? {
            ...post,
            ingredients: (ingredients as PublicPostMedia[]).map(
              withMediaDimensions,
            ),
          }
        : post;
    }),
  };
}

/** Native posts compared when pairing a profile's cross-posts. */
const CROSS_POST_NATIVE_LIMIT = 200;
/** Network posts compared against them. */
const CROSS_POST_NETWORK_LIMIT = 1000;

/**
 * Characters of a caption the pairing reads. It keeps 80 characters of text
 * after stripping markup, so a cut this long gives the same key unless a
 * caption opens with more than ~900 characters of tags.
 */
const CROSS_POST_DESCRIPTION_LENGTH = 1000;

interface CrossPostRow {
  createdAt: Date;
  description: string;
  id: string;
  platform: string | null;
  publishedAt: Date | null;
  url: string | null;
}

function publicPublishedWhere(brandId: string): PrismaWhereQuery {
  return {
    AND: [
      PUBLISHED_AND_LIVE_WHERE,
      postVisibilityReadFilter(PostVisibility.PUBLIC),
    ],
    brandId,
    isDeleted: false,
    isHiddenFromProfile: false,
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
    private readonly mediaPreparation: MediaDerivativePreparationService,
    private readonly logger: LoggerService,
  ) {}

  @Get()
  @Cache({
    keyGenerator: (req) => `public:posts:${JSON.stringify(req.query)}`,
    tags: ['posts', 'public', CACHE_TAGS.PUBLIC_BRAND_CONTENT],
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
        PUBLISHED_AND_LIVE_WHERE,
        postVisibilityReadFilter(PostVisibility.PUBLIC),
      ],
      isDeleted: false,
      isHiddenFromProfile: false,
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
      orderBy: PUBLIC_POSTS_ORDER_BY,
      where: matchQuery,
    };

    const data = await this.postsService.findAll(aggregate, options);
    await this.prepareMedia(data.docs);
    return serializeCollection(
      request,
      PublicPostSerializer,
      withPublicMediaDimensions(data),
    );
  }

  @Get('ingredients')
  @Cache({
    keyGenerator: (req) =>
      `public:posts:ingredients:${JSON.stringify(req.query)}`,
    tags: ['ingredients', 'posts', 'public', CACHE_TAGS.PUBLIC_BRAND_CONTENT],
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
    tags: ['posts', CACHE_TAGS.PUBLIC_BRAND_CONTENT],
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
          PUBLISHED_AND_LIVE_WHERE,
          postVisibilityReadFilter(PostVisibility.PUBLIC),
        ],
        id: postId,
        isHiddenFromProfile: false,
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

    await this.prepareMedia([post]);

    const crossPosts =
      post.platform === CredentialPlatform.GENFEED
        ? await this.findCrossPosts(post)
        : [];

    return serializeSingle(request, PublicPostSerializer, {
      ...post,
      crossPosts,
    });
  }

  /**
   * A public post's media is delivered through a prepared public copy. Media
   * that has none yet is queued here, so the next read of the post (after the
   * cache expires) carries its URL instead of leaving the post without images.
   */
  private async prepareMedia(posts: readonly object[]): Promise<void> {
    const ids = [
      ...new Set(
        posts.flatMap((post) => {
          const { ingredients } = post as {
            ingredients?: readonly { id?: string }[];
          };
          return (ingredients ?? []).flatMap((media) =>
            media.id ? [media.id] : [],
          );
        }),
      ),
    ];
    if (ids.length === 0) {
      return;
    }
    try {
      await this.mediaPreparation.enqueuePublicMissing(ids, 'public-share');
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} could not queue public media`, {
        error,
      });
    }
  }

  /**
   * The posts a pairing compares. The ids come from the public, undeleted
   * brand filter; the second read cuts each caption to the length the pairing
   * needs in SQL, so full captions never reach the request thread.
   */
  private async loadCrossPostCandidates(
    brandId: string,
    where: PrismaWhereQuery,
    take: number,
  ): Promise<CrossPostCandidate[]> {
    const { prisma } = this.postsService;
    // sql-risk-audit: ignore unbounded-read -- `take` is one of the CROSS_POST_*_LIMIT constants (a few hundred ids); the id-only select reads no captions.
    // tenant-scope-ignore: public profile read; publicPublishedWhere pins one public brand and isDeleted: false.
    const ordered = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true },
      take,
      where,
    });
    if (ordered.length === 0) {
      return [];
    }
    const ids = ordered.map((post) => post.id);
    // sql-risk-audit: ignore raw-sql-review -- Primary-key lookup of the ids selected above, pinned to one brand and isDeleted = false; `left()` only trims the caption column.
    const rows = await prisma.$queryRaw<CrossPostRow[]>(Prisma.sql`
      SELECT "id", "platform", "url", "createdAt", "publishedAt",
             left("description", ${CROSS_POST_DESCRIPTION_LENGTH}) AS "description"
      FROM "posts"
      WHERE "id" IN (${Prisma.join(ids)})
        AND "brandId" = ${brandId}
        AND "isDeleted" = false`);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  /** Public network posts of a brand that copy one of its native posts. */
  private async findBrandCrossPostIds(brandId: string): Promise<string[]> {
    const natives = await this.loadCrossPostCandidates(
      brandId,
      {
        ...publicPublishedWhere(brandId),
        platform: CredentialPlatform.GENFEED,
      },
      CROSS_POST_NATIVE_LIMIT,
    );
    if (natives.length === 0) {
      return [];
    }
    const networkPosts = await this.loadCrossPostCandidates(
      brandId,
      {
        ...publicPublishedWhere(brandId),
        platform: { not: CredentialPlatform.GENFEED },
      },
      CROSS_POST_NETWORK_LIMIT,
    );
    return findCrossPostIds(natives, networkPosts);
  }

  /** Where a native post also went live. */
  private async findCrossPosts(
    post: CrossPostCandidate & { brandId?: string },
  ) {
    if (!post.brandId) {
      return [];
    }
    const networkPosts = await this.loadCrossPostCandidates(
      post.brandId,
      {
        ...publicPublishedWhere(post.brandId),
        platform: { not: CredentialPlatform.GENFEED },
        url: { not: null },
      },
      CROSS_POST_NETWORK_LIMIT,
    );
    return listCrossPosts(post, networkPosts);
  }
}
