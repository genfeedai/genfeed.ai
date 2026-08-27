vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => data.docs || data),
}));

import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { VideosRelationshipsController } from '@api/collections/videos/controllers/relationships/videos-relationships.controller';
import { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('VideosRelationshipsController', () => {
  let controller: VideosRelationshipsController;
  let videosService: VideosService;
  let postsService: PostsService;

  const mockReq = {} as Request;

  const videoId = testId('video');
  const parentVideoId = testId('video', 2);
  const organizationId = testId('org');
  const userId = testId('user');
  const brandId = testId('brand');
  const postId = testId('post');

  const mockVideo = {
    id: videoId,
    organizationId,
    parentId: parentVideoId,
    userId,
  };

  const mockUser = {
    id: 'user_123',
    brandId,
    organizationId,
    userId,
  } as unknown as User;

  const mockServices = {
    loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    postsService: { findAll: vi.fn() },
    videosService: { findAll: vi.fn(), findOne: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideosRelationshipsController],
      providers: [
        { provide: LoggerService, useValue: mockServices.loggerService },
        {
          provide: PostsService,
          useValue: mockServices.postsService,
        },
        { provide: VideosService, useValue: mockServices.videosService },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VideosRelationshipsController>(
      VideosRelationshipsController,
    );
    videosService = module.get<VideosService>(VideosService);
    postsService = module.get<PostsService>(PostsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findChildren', () => {
    it('should return child videos', async () => {
      const query: VideosQueryDto = {};

      const mockData = {
        docs: [mockVideo],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      };

      mockServices.videosService.findAll.mockResolvedValue(mockData);

      const result = await controller.findChildren(
        mockReq,
        parentVideoId,
        query,
      );

      expect(videosService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ parentId: parentVideoId }),
        }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findAllPosts', () => {
    it('should return posts for video', async () => {
      const query: VideosQueryDto = {};

      const mockData = {
        docs: [
          {
            id: postId,
            ingredients: [{ id: videoId }],
            platform: 'twitter',
            status: 'published',
          },
        ],
        limit: 10,
        page: 1,
        pages: 1,
        total: 1,
      };

      mockServices.postsService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAllPosts(
        mockReq,
        videoId,
        mockUser,
        query,
      );

      expect(postsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ingredients: { some: { id: videoId } },
            organizationId: mockUser.organizationId,
            userId: mockUser.userId,
          }),
        }),
        expect.anything(),
      );
      expect(result).toBeDefined();
    });
  });
});
