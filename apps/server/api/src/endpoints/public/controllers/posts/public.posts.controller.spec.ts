import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PostDocument } from '@api/collections/posts/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublicPostsController } from '@api/endpoints/public/controllers/posts/public.posts.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import {
  postExecutionStateReadFilter,
  postVisibilityReadFilter,
} from '@api-types/contracts/scheduler.contract';
import {
  AssetScope,
  IngredientStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/enums';
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

  const mockRequest = {
    originalUrl: '/api/public/posts',
    query: {},
  } as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicPostsController],
      providers: [
        {
          provide: PostsService,
          useValue: {
            findAll: vi.fn(),
            findOne: vi.fn(),
          },
        },
        {
          provide: IngredientsService,
          useValue: {
            findAll: vi.fn(),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            error: vi.fn(),
            log: vi.fn(),
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
          postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
          postVisibilityReadFilter(PostVisibility.PUBLIC),
        ],
        isDeleted: false,
      });
      expect(callArgs.where.scope).toBeUndefined();
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
            postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
            postVisibilityReadFilter(PostVisibility.PUBLIC),
          ],
          id: postId,
        },
        [],
      );
      expect(result).toEqual({
        data: {
          id: postId,
          targetExecutionState: TargetExecutionState.PUBLISHED,
          title: 'Test Post',
          visibility: PostVisibility.PUBLIC,
        },
      });
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
            postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
            postVisibilityReadFilter(PostVisibility.PUBLIC),
          ],
          id: postId,
        },
        [],
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
