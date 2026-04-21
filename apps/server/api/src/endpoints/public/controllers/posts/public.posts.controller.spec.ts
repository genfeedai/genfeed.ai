import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { PublicPostsController } from '@api/endpoints/public/controllers/posts/public.posts.controller';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { AssetScope, PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

const createBaseQuery = (partial: Partial<BaseQueryDto> = {}): BaseQueryDto =>
  ({
    isDeleted: false,
    limit: 10,
    page: 1,
    pagination: true,
    sort: 'createdAt: -1',
    ...partial,
  }) as BaseQueryDto;

const asMatchStage = (stage: Record<string, unknown>) =>
  stage as Record<string, unknown> & { $match: Record<string, unknown> };

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

vi.mock('@genfeedai/serializers', () => ({
  PostSerializer: {
    opts: {},
    serialize: vi.fn((data) => data),
  },
}));

describe('PublicPostsController', () => {
  let controller: PublicPostsController;
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
          { _id: 'pub1', title: 'Post 1' },
          { _id: 'pub2', title: 'Post 2' },
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
      const brandId = '507f191e810c19729de860ee'.toString();
      const mockPosts = {
        docs: [{ _id: 'pub1', brand: brandId }],
        page: 1,
        totalDocs: 1,
      };

      postsService.findAll.mockResolvedValue(
        mockPosts as unknown as AggregatePaginateResult<PostDocument>,
      );

      await controller.findPublicPosts(mockRequest, query, undefined, brandId);

      const callArgs = postsService.findAll.mock.calls[0][0];
      const matchStage = asMatchStage(callArgs[0]);
      expect(matchStage.$match.brand).toBeDefined();
      expect((matchStage.$match.brand as string).toString()).toBe(brandId);
    });

    it('should filter by tag when provided', async () => {
      const query = createBaseQuery();
      const tag = 'technology';
      const mockPosts = {
        docs: [{ _id: 'pub1', metadata: { tags: ['technology'] } }],
        page: 1,
        totalDocs: 1,
      };

      postsService.findAll.mockResolvedValue(
        mockPosts as unknown as AggregatePaginateResult<PostDocument>,
      );

      await controller.findPublicPosts(mockRequest, query, tag);

      const callArgs = postsService.findAll.mock.calls[0][0];
      const matchStage = asMatchStage(callArgs[0]);
      expect(matchStage.$match['metadata.tags']).toBeDefined();
      expect(
        (matchStage.$match['metadata.tags'] as { $regex: string }).$regex,
      ).toBe(tag);
      expect(
        (matchStage.$match['metadata.tags'] as { $options: string }).$options,
      ).toBe('i');
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

      const callArgs = postsService.findAll.mock.calls[0][0];
      expect(asMatchStage(callArgs[0]).$match).toEqual({
        isDeleted: false,
        scope: AssetScope.PUBLIC,
        status: PostStatus.PUBLIC,
      });
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

      const callArgs = postsService.findAll.mock.calls[0][0];
      expect(asMatchStage(callArgs[0]).$match.brand).toBeUndefined();
    });
  });

  describe('getPostMetadata', () => {
    it('should return post metadata for valid id', async () => {
      const postId = '507f191e810c19729de860ee'.toString();
      const mockPost = {
        _id: postId,
        status: PostStatus.PUBLIC,
        title: 'Test Post',
      };

      postsService.findOne.mockResolvedValue(mockPost as never);

      const result = await controller.getPostMetadata(mockRequest, postId);

      expect(postsService.findOne).toHaveBeenCalledWith({
        _id: postId,
        isDeleted: false,
      });
      expect(result).toEqual({ data: mockPost });
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
      const postId = '507f191e810c19729de860ee'.toString();
      const responseUtil = await import(
        '@api/helpers/utils/response/response.util'
      );
      const returnNotFound = responseUtil.returnNotFound;

      postsService.findOne.mockResolvedValue(null);

      await controller.getPostMetadata(mockRequest, postId);

      expect(postsService.findOne).toHaveBeenCalledWith({
        _id: postId,
        isDeleted: false,
      });
      expect(returnNotFound).toHaveBeenCalledWith(
        'PublicPostsController',
        postId,
      );
    });

    it('should log the request with correct parameters', async () => {
      const postId = '507f191e810c19729de860ee'.toString();
      const mockPost = {
        _id: postId,
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
