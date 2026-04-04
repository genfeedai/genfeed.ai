vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw new HttpException(response, 400);
  }),
  returnForbidden: vi.fn(),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
    statusCode: 404,
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PostsController } from '@api/collections/posts/controllers/posts.controller';
import { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import { UpdatePostDto } from '@api/collections/posts/dto/update-post.dto';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { QuotaService } from '@api/services/quota/quota.service';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('PostsController', () => {
  let controller: PostsController;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockPost = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439014'),
    brand: new Types.ObjectId('507f1f77bcf86cd799439013'),
    credential: new Types.ObjectId('507f1f77bcf86cd799439016'),
    isDeleted: false,
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    platform: 'youtube',
    status: 'draft',
    user: new Types.ObjectId('507f1f77bcf86cd799439011'),
  };

  const mockIngredient = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439015'),
    brand: new Types.ObjectId('507f1f77bcf86cd799439013'),
    campaign: 'spring-drop',
    category: 'video',
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    reviewStatus: 'approved',
    user: new Types.ObjectId('507f1f77bcf86cd799439011'),
  };

  const mockCampaignIngredient = {
    ...mockIngredient,
    _id: new Types.ObjectId('507f1f77bcf86cd799439017'),
    category: 'image',
  };

  const mockCredential = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439016'),
    isConnected: true,
    isDeleted: false,
    label: 'YouTube Channel',
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    platform: 'youtube',
  };

  const mockRequest = {
    originalUrl: '/api/posts',
    query: {},
  } as Request;

  const mockServices = {
    activitiesService: {
      create: vi.fn(),
    },
    credentialsService: {
      findOne: vi.fn().mockResolvedValue(mockCredential),
    },
    ingredientsService: {
      findApprovedImagesByCampaign: vi
        .fn()
        .mockResolvedValue([mockCampaignIngredient]),
      findByIds: vi.fn().mockResolvedValue([mockIngredient]),
      findOne: vi.fn().mockResolvedValue(mockIngredient),
    },
    loggerService: {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    postAnalyticsService: {
      getPostAnalyticsSummary: vi.fn().mockResolvedValue(null),
    },
    postsService: {
      create: vi.fn().mockResolvedValue(mockPost),
      findAll: vi.fn(),
      findOne: vi.fn(),
      getChildren: vi.fn().mockResolvedValue([]),
      handleYoutubePost: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn(),
      remove: vi.fn(),
    },
    quotaService: {
      verifyQuota: vi.fn().mockResolvedValue(true),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockServices.activitiesService,
        },
        {
          provide: CredentialsService,
          useValue: mockServices.credentialsService,
        },
        {
          provide: IngredientsService,
          useValue: mockServices.ingredientsService,
        },
        { provide: PostsService, useValue: mockServices.postsService },
        { provide: QuotaService, useValue: mockServices.quotaService },
        { provide: LoggerService, useValue: mockServices.loggerService },
        {
          provide: PostAnalyticsService,
          useValue: mockServices.postAnalyticsService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PostsController>(PostsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a post', async () => {
      const createPostDto: CreatePostDto = {
        credential: '507f1f77bcf86cd799439016',
        status: 'draft',
      };

      const result = await controller.create(
        mockRequest,
        mockUser,
        createPostDto,
      );

      expect(mockServices.credentialsService.findOne).toHaveBeenCalled();
      expect(mockServices.postsService.create).toHaveBeenCalled();
      expect(mockServices.activitiesService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw error when credential not found', async () => {
      mockServices.credentialsService.findOne.mockResolvedValueOnce(null);

      const createPostDto: CreatePostDto = {
        credential: '507f1f77bcf86cd799439016',
      };

      await expect(
        controller.create(mockRequest, mockUser, createPostDto),
      ).rejects.toThrow(HttpException);
    });

    it('should use credential platform and label', async () => {
      const createPostDto: CreatePostDto = {
        credential: '507f1f77bcf86cd799439016',
      };

      await controller.create(mockRequest, mockUser, createPostDto);

      expect(mockServices.postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: mockCredential.platform,
        }),
      );
    });

    it('should resolve approved campaign images when campaign is provided', async () => {
      const createPostDto: CreatePostDto = {
        campaign: 'spring-drop',
        credential: '507f1f77bcf86cd799439016',
        description: 'Campaign carousel',
        ingredients: [],
        label: 'Campaign carousel',
        status: 'draft',
      };

      await controller.create(mockRequest, mockUser, createPostDto);

      expect(
        mockServices.ingredientsService.findApprovedImagesByCampaign,
      ).toHaveBeenCalledWith(
        'spring-drop',
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(mockServices.postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: mockCampaignIngredient.brand,
          ingredients: [mockCampaignIngredient._id],
          organization: mockCampaignIngredient.organization,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated posts', async () => {
      const mockData = {
        docs: [mockPost],
        hasNextPage: false,
        hasPrevPage: false,
        limit: 10,
        page: 1,
        totalDocs: 1,
        totalPages: 1,
      };

      mockServices.postsService.findAll.mockResolvedValue(mockData);

      const result = await controller.findAll(mockRequest, mockUser, {
        limit: 10,
        page: 1,
      });

      expect(mockServices.postsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should filter by isDeleted', async () => {
      const mockData = {
        docs: [mockPost],
        totalDocs: 1,
      };

      mockServices.postsService.findAll.mockResolvedValue(mockData);

      await controller.findAll(mockRequest, mockUser, { isDeleted: false });

      expect(mockServices.postsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single post', async () => {
      const postId = '507f1f77bcf86cd799439014';
      mockServices.postsService.findAll.mockResolvedValue({
        docs: [
          {
            ...mockPost,
            organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
          },
        ],
      });

      const result = await controller.findOne(mockRequest, mockUser, postId);

      expect(mockServices.postsService.findAll).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw 404 when post not found', async () => {
      mockServices.postsService.findAll.mockResolvedValue({ docs: [] });

      await expect(
        controller.findOne(mockRequest, mockUser, '507f1f77bcf86cd799439014'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('patch', () => {
    it('should update a post', async () => {
      const updatePostDto: UpdatePostDto = {
        status: 'published',
      };

      const updatedPost = {
        ...mockPost,
        ...updatePostDto,
      };

      mockServices.postsService.findOne.mockResolvedValue(mockPost);
      mockServices.postsService.patch.mockResolvedValue(updatedPost);

      const result = await controller.patch(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439014',
        updatePostDto,
      );

      expect(result).toBeDefined();
    });

    it('should return 404 when post not found', async () => {
      mockServices.postsService.findOne.mockResolvedValue(null);

      await expect(
        controller.patch(mockRequest, mockUser, '507f1f77bcf86cd799439014', {}),
      ).rejects.toBeDefined();
    });
  });

  describe('remove', () => {
    it('should remove a post', async () => {
      mockServices.postsService.findOne.mockResolvedValue(mockPost);
      mockServices.postsService.remove.mockResolvedValue(mockPost);

      const result = await controller.remove(
        mockRequest,
        mockUser,
        '507f1f77bcf86cd799439014',
      );

      expect(result).toBeDefined();
    });

    it('should throw when post not found', async () => {
      mockServices.postsService.findOne.mockResolvedValue(null);

      await expect(
        controller.remove(mockRequest, mockUser, '507f1f77bcf86cd799439014'),
      ).rejects.toBeDefined();
    });
  });
});
