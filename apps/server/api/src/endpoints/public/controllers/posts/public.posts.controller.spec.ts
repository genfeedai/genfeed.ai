import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PUBLISHED_AND_LIVE_WHERE } from '@api/collections/posts/services/post-inbox-delivery.filter';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublicPostsController } from '@api/endpoints/public/controllers/posts/public.posts.controller';
import { PUBLIC_POSTS_ORDER_BY } from '@api/endpoints/public/utils/public-posts-order.util';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MediaDerivativePreparationService } from '@api/services/media-urls/media-derivative-preparation.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  AssetScope,
  IngredientStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { postVisibilityReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const createBaseQuery = (partial: Partial<BaseQueryDto> = {}): BaseQueryDto =>
  ({
    isDeleted: false,
    limit: 10,
    page: 1,
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
  setTopLinks: vi.fn((_req, opts) => opts),
}));

vi.mock('@genfeedai/serializers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@genfeedai/serializers')>();
  return {
    ...actual,
    PublicPostSerializer: {
      opts: {},
      serialize: vi.fn((data) => data),
    },
  };
});

describe('PublicPostsController', () => {
  let controller: PublicPostsController;
  let ingredientsService: vi.Mocked<IngredientsService>;
  let postsService: vi.Mocked<PostsService>;
  let loggerService: vi.Mocked<LoggerService>;
  const enqueuePublicMissing = vi.fn();

  const mockRequest = {
    originalUrl: '/api/public/posts',
    query: {},
  } as Request;

  const postFindMany = vi.fn();
  const queryRaw = vi.fn();

  beforeEach(async () => {
    postFindMany.mockReset();
    enqueuePublicMissing.mockReset();
    enqueuePublicMissing.mockResolvedValue(undefined);
    postFindMany.mockResolvedValue([]);
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicPostsController],
      providers: [
        {
          provide: PostsService,
          useValue: {
            findAll: vi.fn(),
            findOne: vi.fn(),
            prisma: { $queryRaw: queryRaw, post: { findMany: postFindMany } },
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findAll: vi.fn(),
          },
        },
        {
          provide: MediaDerivativePreparationService,
          useValue: { enqueuePublicMissing },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PublicPostsController>(PublicPostsController);
    ingredientsService = module.get(IngredientsService);
    postsService = module.get(PostsService);
    loggerService = module.get(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findPublicPosts', () => {
    it('should return public posts list', async () => {
      const query = createBaseQuery();
      const mockPosts = {
        docs: [
          { id: 'pub1', title: 'Post 1' },
          { id: 'pub2', title: 'Post 2' },
        ],
        page: 1,
        totalDocs: 2,
      };

      postsService.findAll.mockResolvedValue(
        mockPosts as unknown as AggregatePaginateResult<PostDocument>,
      );

      const result = await controller.findPublicPosts(mockRequest, query);

      expect(postsService.findAll).toHaveBeenCalled();
      expect(result).toEqual({ data: mockPosts.docs });
    });

    it('returns each post with the totals of its latest analytics day', async () => {
      postsService.findAll.mockResolvedValue({
        docs: [
          { brand: { isPublicAnalyticsEnabled: true }, id: 'measured' },
          { brand: { isPublicAnalyticsEnabled: true }, id: 'not-measured' },
        ],
        page: 1,
        totalDocs: 2,
      } as unknown as AggregatePaginateResult<PostDocument>);
      queryRaw.mockResolvedValue([
        {
          engagementRate: 4.5,
          postId: 'measured',
          totalComments: 4,
          totalLikes: 90,
          totalSaves: 6,
          totalShares: 8,
          totalViews: 2000,
        },
      ]);

      const result = await controller.findPublicPosts(
        mockRequest,
        createBaseQuery(),
      );

      expect(result.data).toEqual([
        {
          avgEngagementRate: 4.5,
          brand: { isPublicAnalyticsEnabled: true },
          id: 'measured',
          totalComments: 4,
          totalLikes: 90,
          totalSaves: 6,
          totalShares: 8,
          totalViews: 2000,
        },
        { brand: { isPublicAnalyticsEnabled: true }, id: 'not-measured' },
      ]);
    });

    it('returns no counts for a brand with Public analytics off, and does not read them', async () => {
      postsService.findAll.mockResolvedValue({
        docs: [{ brand: { isPublicAnalyticsEnabled: false }, id: 'private' }],
        page: 1,
        totalDocs: 1,
      } as unknown as AggregatePaginateResult<PostDocument>);
      queryRaw.mockResolvedValue([
        { engagementRate: 9, postId: 'private', totalViews: 5000 },
      ]);

      const result = await controller.findPublicPosts(
        mockRequest,
        createBaseQuery(),
      );

      expect(result.data).toEqual([
        { brand: { isPublicAnalyticsEnabled: false }, id: 'private' },
      ]);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('reads frame size from the media metadata, not the Ingredient row', async () => {
      postsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<PostDocument>);

      await controller.findPublicPosts(mockRequest, createBaseQuery());

      const include = (
        postsService.findAll.mock.calls[0][0] as {
          include: {
            ingredientLinks: {
              include: { ingredient: { select: Record<string, unknown> } };
            };
          };
        }
      ).include;
      const select = include.ingredientLinks.include.ingredient.select;
      expect(select.metadata).toEqual({
        select: { height: true, width: true },
      });
      expect(select).not.toHaveProperty('height');
      expect(select).not.toHaveProperty('width');
    });

    it('returns media dimensions from metadata and none when it is missing', async () => {
      postsService.findAll.mockResolvedValue({
        docs: [
          {
            id: 'with-media',
            ingredients: [
              { id: 'a', metadata: { height: 720, width: 1280 } },
              { id: 'b', metadata: null },
            ],
          },
          { id: 'text-only' },
        ],
        page: 1,
        totalDocs: 2,
      } as unknown as AggregatePaginateResult<PostDocument>);

      const result = await controller.findPublicPosts(
        mockRequest,
        createBaseQuery(),
      );

      expect(result).toEqual({
        data: [
          {
            id: 'with-media',
            ingredients: [{ height: 720, id: 'a', width: 1280 }, { id: 'b' }],
          },
          { id: 'text-only' },
        ],
      });
    });

    it('queues the public copy of the media a listed post shows', async () => {
      postsService.findAll.mockResolvedValue({
        docs: [
          { id: 'one', ingredients: [{ id: 'a' }, { id: 'b' }] },
          { id: 'two', ingredients: [{ id: 'b' }] },
          { id: 'text-only' },
        ],
        page: 1,
        totalDocs: 3,
      } as unknown as AggregatePaginateResult<PostDocument>);

      await controller.findPublicPosts(mockRequest, createBaseQuery());

      expect(enqueuePublicMissing).toHaveBeenCalledWith(
        ['a', 'b'],
        'public-share',
      );
    });

    it('still answers when the media cannot be queued', async () => {
      enqueuePublicMissing.mockRejectedValue(new Error('queue down'));
      postsService.findAll.mockResolvedValue({
        docs: [{ id: 'one', ingredients: [{ id: 'a' }] }],
        page: 1,
        totalDocs: 1,
      } as unknown as AggregatePaginateResult<PostDocument>);

      const result = await controller.findPublicPosts(
        mockRequest,
        createBaseQuery(),
      );

      expect(result).toEqual({
        data: [{ id: 'one', ingredients: [{ id: 'a' }] }],
      });
    });

    it('lists a network copy of a Genfeed profile post only once', async () => {
      const query = createBaseQuery();
      const brandId = testId('brand');
      postsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<PostDocument>);
      postFindMany
        .mockResolvedValueOnce([{ id: 'native' }])
        .mockResolvedValueOnce([{ id: 'x-copy' }, { id: 'x-other' }]);
      queryRaw
        .mockResolvedValueOnce([
          {
            description: 'Shipped the new studio today',
            id: 'native',
            platform: 'genfeed',
            publishedAt: new Date('2026-11-08T10:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            description: 'Something else',
            id: 'x-other',
            platform: 'twitter',
            publishedAt: new Date('2026-11-08T10:01:00.000Z'),
          },
          {
            description: 'Shipped the new studio today',
            id: 'x-copy',
            platform: 'twitter',
            publishedAt: new Date('2026-11-08T10:01:00.000Z'),
          },
        ]);

      await controller.findPublicPosts(mockRequest, query, undefined, brandId);

      const callArgs = postsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where.id).toEqual({ notIn: ['x-copy'] });
    });

    it('reads no full caption to pair cross-posts', async () => {
      const query = createBaseQuery();
      const brandId = testId('brand');
      postsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<PostDocument>);
      postFindMany.mockResolvedValue([{ id: 'native' }]);
      queryRaw.mockResolvedValue([
        {
          description: 'Shipped the new studio today',
          id: 'native',
          platform: 'genfeed',
          publishedAt: new Date('2026-11-08T10:00:00.000Z'),
        },
      ]);

      await controller.findPublicPosts(mockRequest, query, undefined, brandId);

      for (const [args] of postFindMany.mock.calls) {
        expect(args.select).toEqual({ id: true });
      }
      const [statement] = queryRaw.mock.calls[0] as [
        { sql: string; values: unknown[] },
      ];
      expect(statement.sql).toContain('left("description"');
      expect(statement.sql).not.toMatch(/SELECT[^F]*,\s*"description"\s*,/);
      expect(statement.sql).toContain('"isDeleted" = false');
      expect(statement.values).toContain(brandId);
    });

    it('should filter by account when provided', async () => {
      const query = createBaseQuery();
      const brandId = testId('brand');
      const mockPosts = {
        docs: [{ brandId, id: 'pub1' }],
        page: 1,
        totalDocs: 1,
      };

      postsService.findAll.mockResolvedValue(
        mockPosts as unknown as AggregatePaginateResult<PostDocument>,
      );

      await controller.findPublicPosts(mockRequest, query, undefined, brandId);

      const callArgs = postsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where.brandId).toBe(brandId);
      // A brand id lists posts only while that brand's profile is public.
      expect(callArgs.where.brand).toEqual({
        is: { isDeleted: false, scope: 'PUBLIC' },
      });
    });

    it('should filter by tag when provided', async () => {
      const query = createBaseQuery();
      const tag = 'technology';
      const mockPosts = {
        docs: [{ id: 'pub1', metadata: { tags: ['technology'] } }],
        page: 1,
        totalDocs: 1,
      };

      postsService.findAll.mockResolvedValue(
        mockPosts as unknown as AggregatePaginateResult<PostDocument>,
      );

      await controller.findPublicPosts(mockRequest, query, tag);

      const callArgs = postsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where.tags).toEqual({
        some: { label: { contains: tag, mode: 'insensitive' } },
      });
    });

    it('should apply correct match query for public posts', async () => {
      const query = createBaseQuery();
      const mockPosts = {
        docs: [],
        page: 1,
        totalDocs: 0,
      };

      postsService.findAll.mockResolvedValue(
        mockPosts as unknown as AggregatePaginateResult<PostDocument>,
      );

      await controller.findPublicPosts(mockRequest, query);

      const callArgs = postsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where).toEqual({
        AND: [
          PUBLISHED_AND_LIVE_WHERE,
          postVisibilityReadFilter(PostVisibility.PUBLIC),
        ],
        brand: { is: { isDeleted: false, scope: 'PUBLIC' } },
        isDeleted: false,
        isHiddenFromProfile: false,
      });
      expect(callArgs.where.scope).toBeUndefined();
    });

    it('lists posts in publish order, the order their tiles show dates in', async () => {
      postsService.findAll.mockResolvedValue({
        docs: [],
      } as unknown as AggregatePaginateResult<PostDocument>);

      await controller.findPublicPosts(mockRequest, createBaseQuery());

      const callArgs = postsService.findAll.mock.calls[0][0] as {
        orderBy: unknown;
      };
      expect(callArgs.orderBy).toBe(PUBLIC_POSTS_ORDER_BY);
    });

    it('should handle invalid account id gracefully', async () => {
      const query = createBaseQuery();
      const invalidAccountId = 'invalid-id';
      const mockPosts = {
        docs: [],
        page: 1,
        totalDocs: 0,
      };

      postsService.findAll.mockResolvedValue(
        mockPosts as unknown as AggregatePaginateResult<PostDocument>,
      );

      await controller.findPublicPosts(
        mockRequest,
        query,
        undefined,
        invalidAccountId,
      );

      const callArgs = postsService.findAll.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(callArgs.where.brandId).toBeUndefined();
    });
  });

  describe('findPublicIngredients', () => {
    it('uses deterministic Prisma-supported ordering for the reported request shape', async () => {
      const request = {
        originalUrl:
          '/v1/public/posts/ingredients?limit=15&page=1&sort=createdAt%3A+-1',
        query: {
          limit: '15',
          page: '1',
          sort: 'createdAt: -1',
        },
      } as unknown as Request;
      const query = createBaseQuery({
        limit: 15,
        page: 1,
        sort: 'createdAt: -1',
      });
      const mockIngredients = {
        docs: [],
        page: 1,
        totalDocs: 0,
      };

      ingredientsService.findAll.mockResolvedValue(mockIngredients as never);

      const result = await controller.findPublicIngredients(request, query);

      expect(ingredientsService.findAll).toHaveBeenCalledWith(
        {
          orderBy: [{ createdAt: -1 }, { id: -1 }],
          where: {
            isDeleted: false,
            scope: AssetScope.PUBLIC,
            status: IngredientStatus.GENERATED,
          },
        },
        expect.objectContaining({
          limit: 15,
          page: 1,
          pagination: true,
        }),
      );
      expect(ingredientsService.findAll.mock.calls[0][0]).not.toHaveProperty(
        'orderBy.totalPosts',
      );
      expect(loggerService.log).toHaveBeenCalledWith(
        'PublicPostsController findPublicIngredients',
        { query },
      );
      expect(result).toEqual({ data: [] });
    });
  });

  describe('getPostMetadata', () => {
    it('links a Genfeed profile post to its copies on the networks', async () => {
      const postId = testId('post');
      const brandId = testId('brand');
      postsService.findOne.mockResolvedValue({
        brandId,
        createdAt: new Date('2026-11-08T10:00:00.000Z'),
        description: 'Shipped the new studio today',
        id: postId,
        platform: 'genfeed',
        publishedAt: new Date('2026-11-08T10:00:00.000Z'),
      } as never);
      postFindMany.mockResolvedValue([{ id: 'x-copy' }]);
      queryRaw.mockResolvedValue([
        {
          createdAt: new Date('2026-11-08T10:01:00.000Z'),
          description: 'Shipped the new studio today',
          id: 'x-copy',
          platform: 'twitter',
          publishedAt: new Date('2026-11-08T10:01:00.000Z'),
          url: 'https://x.com/acme/status/1',
        },
      ]);

      const result = await controller.getPostMetadata(
        mockRequest,
        postId,
        brandId,
      );

      expect(result.data).toHaveProperty('crossPosts', [
        { platform: 'twitter', url: 'https://x.com/acme/status/1' },
      ]);
    });

    it('returns the totals of the post latest analytics day', async () => {
      const postId = testId('post');
      postsService.findOne.mockResolvedValue({
        brand: { isPublicAnalyticsEnabled: true },
        id: postId,
        platform: 'instagram',
      } as never);
      queryRaw.mockResolvedValue([
        {
          engagementRate: 2.5,
          postId,
          totalComments: 1,
          totalLikes: 20,
          totalSaves: 2,
          totalShares: 3,
          totalViews: 800,
        },
      ]);

      const result = await controller.getPostMetadata(mockRequest, postId);

      expect(result.data).toMatchObject({
        avgEngagementRate: 2.5,
        totalLikes: 20,
        totalViews: 800,
      });
    });

    it('returns no counts for a post whose brand turned Public analytics off', async () => {
      const postId = testId('post');
      postsService.findOne.mockResolvedValue({
        brand: { isPublicAnalyticsEnabled: false },
        id: postId,
        platform: 'instagram',
      } as never);
      queryRaw.mockResolvedValue([{ postId, totalViews: 800 }]);

      const result = await controller.getPostMetadata(mockRequest, postId);

      expect(result.data).not.toHaveProperty('totalViews');
    });

    it('should return post metadata for valid id', async () => {
      const postId = testId('post');

      postsService.findOne.mockResolvedValue({
        id: postId,
        targetExecutionState: TargetExecutionState.PUBLISHED,
        title: 'Test Post',
        visibility: PostVisibility.PUBLIC,
      } as never);

      const result = await controller.getPostMetadata(mockRequest, postId);

      expect(postsService.findOne).toHaveBeenCalledWith(
        {
          AND: [
            PUBLISHED_AND_LIVE_WHERE,
            postVisibilityReadFilter(PostVisibility.PUBLIC),
          ],
          brand: { is: { isDeleted: false, scope: 'PUBLIC' } },
          id: postId,
          isHiddenFromProfile: false,
        },
        ['ingredients', 'brand'],
      );
      expect(result).toEqual({
        data: {
          crossPosts: [],
          id: postId,
          targetExecutionState: TargetExecutionState.PUBLISHED,
          title: 'Test Post',
          visibility: PostVisibility.PUBLIC,
        },
      });
    });

    it('answers 404 for a post its owner hid from the profile', async () => {
      const postId = testId('post');
      postsService.findOne.mockResolvedValue(null);

      await controller.getPostMetadata(mockRequest, postId);

      expect(postsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ id: postId, isHiddenFromProfile: false }),
        ['ingredients', 'brand'],
      );
    });

    it('scopes the read to the brand a creator page names', async () => {
      const postId = testId('post');
      const brandId = testId('brand');
      postsService.findOne.mockResolvedValue(null);

      await controller.getPostMetadata(mockRequest, postId, brandId);

      expect(postsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ brandId, id: postId }),
        ['ingredients', 'brand'],
      );
    });

    it('should not expose a post that is not public', async () => {
      const postId = testId('post');
      const responseUtil = await import(
        '@api/helpers/utils/response/response.util'
      );

      postsService.findOne.mockResolvedValue(null);

      await controller.getPostMetadata(mockRequest, postId);

      expect(responseUtil.returnNotFound).toHaveBeenCalledWith(
        'PublicPostsController',
        postId,
      );
    });

    it('should return not found for invalid object id', async () => {
      const invalidId = 'invalid-id';
      const responseUtil = await import(
        '@api/helpers/utils/response/response.util'
      );
      const returnNotFound = responseUtil.returnNotFound;

      const result = await controller.getPostMetadata(mockRequest, invalidId);

      expect(postsService.findOne).not.toHaveBeenCalled();
      expect(returnNotFound).toHaveBeenCalledWith(
        'PublicPostsController',
        invalidId,
      );
      expect(result).toEqual({
        errors: [
          {
            detail: `PublicPostsController ${invalidId} not found`,
            status: '404',
            title: 'Not Found',
          },
        ],
      });
    });

    it('should return not found when post does not exist', async () => {
      const postId = testId('post');
      const responseUtil = await import(
        '@api/helpers/utils/response/response.util'
      );
      const returnNotFound = responseUtil.returnNotFound;

      postsService.findOne.mockResolvedValue(null);

      await controller.getPostMetadata(mockRequest, postId);

      expect(postsService.findOne).toHaveBeenCalledWith(
        {
          AND: [
            PUBLISHED_AND_LIVE_WHERE,
            postVisibilityReadFilter(PostVisibility.PUBLIC),
          ],
          brand: { is: { isDeleted: false, scope: 'PUBLIC' } },
          id: postId,
          isHiddenFromProfile: false,
        },
        ['ingredients', 'brand'],
      );
      expect(returnNotFound).toHaveBeenCalledWith(
        'PublicPostsController',
        postId,
      );
    });

    it('should log the request with correct parameters', async () => {
      const postId = testId('post');
      const mockPost = {
        id: postId,
        title: 'Test Post',
      };

      postsService.findOne.mockResolvedValue(mockPost as never);

      await controller.getPostMetadata(mockRequest, postId);

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('PublicPostsController'),
        { params: { postId } },
      );
    });
  });
});
