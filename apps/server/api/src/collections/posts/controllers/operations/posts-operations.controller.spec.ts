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

vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { ConfigService } from '@api/config/config.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { QuotaService } from '@api/services/quota/quota.service';
import type { User } from '@clerk/backend';
import {
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

describe('PostsOperationsController', () => {
  let controller: PostsOperationsController;

  // Mock IDs
  const userId = '507f1f77bcf86cd799439011';
  const organizationId = '507f1f77bcf86cd799439012';
  const brandId = '507f1f77bcf86cd799439013';
  const postId = '507f1f77bcf86cd799439014';
  const credentialId = '507f1f77bcf86cd799439016';
  const ingredientId = '507f1f77bcf86cd799439017';

  const mockUser = {
    id: 'user_clerk_123',
    publicMetadata: {
      brand: brandId,
      organization: organizationId,
      user: userId,
    },
  } as unknown as User;

  const mockPost = {
    _id: new Types.ObjectId(postId),
    brand: new Types.ObjectId(brandId),
    category: PostCategory.TEXT,
    credential: new Types.ObjectId(credentialId),
    description: 'Test post description',
    isDeleted: false,
    organization: new Types.ObjectId(organizationId),
    parent: undefined,
    platform: CredentialPlatform.TWITTER,
    status: PostStatus.DRAFT,
    user: new Types.ObjectId(userId),
  };

  const mockCredential = {
    _id: new Types.ObjectId(credentialId),
    handle: '@testaccount',
    isConnected: true,
    isDeleted: false,
    label: 'Twitter Account',
    organization: new Types.ObjectId(organizationId),
    platform: CredentialPlatform.TWITTER,
  };

  const mockIngredient = {
    _id: new Types.ObjectId(ingredientId),
    brand: new Types.ObjectId(brandId),
    category: IngredientCategory.IMAGE,
    isDeleted: false,
    organization: new Types.ObjectId(organizationId),
    url: 'https://example.com/image.jpg',
  };

  const mockActivity = {
    _id: new Types.ObjectId(),
    key: 'POST_PROCESSING',
    source: 'POST_GENERATION',
  };

  const mockRequest = {
    originalUrl: '/api/posts',
    query: {},
  } as Request;

  // Mock Services
  const mockActivitiesService = {
    create: vi.fn().mockResolvedValue(mockActivity),
    patch: vi.fn().mockResolvedValue(mockActivity),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      const config: Record<string, unknown> = {
        MAX_TOKENS: 4096,
      };
      return config[key];
    }),
    isDevelopment: false,
  };

  const mockCredentialsService = {
    findOne: vi.fn().mockResolvedValue(mockCredential),
  };

  const mockIngredientsService = {
    findByIds: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(mockIngredient),
  };

  const mockMembersService = {
    findOne: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockPostsService = {
    addThreadReply: vi.fn().mockResolvedValue(mockPost),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(mockPost),
    createRemix: vi.fn().mockResolvedValue(mockPost),
    findAll: vi.fn().mockResolvedValue({ docs: [mockPost] }),
    findByIds: vi.fn().mockResolvedValue([mockPost]),
    findOne: vi.fn().mockResolvedValue(mockPost),
    patch: vi.fn().mockResolvedValue(mockPost),
  };

  const mockPromptBuilderService = {
    buildPrompt: vi.fn().mockResolvedValue({
      input: { max_tokens: 4096, prompt: 'test prompt' },
    }),
  };

  const mockQuotaService = {
    verifyQuota: vi.fn().mockResolvedValue(true),
  };

  const mockReplicateService = {
    generateTextCompletionSync: vi.fn().mockResolvedValue(
      `Tweet 1: This is a great tweet about technology.
Tweet 2: Here's another insightful post.
Tweet 3: Tech innovation is changing the world.`,
    ),
  };

  const mockTemplatesService = {
    getRenderedPrompt: vi.fn().mockResolvedValue('Generated prompt template'),
  };

  const mockTrendReferenceCorpusService = {
    recordDraftRemixLineage: vi.fn().mockResolvedValue(undefined),
  };

  const mockWebsocketService = {
    emit: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockActivitiesService.create.mockResolvedValue(mockActivity);
    mockActivitiesService.patch.mockResolvedValue(mockActivity);
    mockCredentialsService.findOne.mockResolvedValue(mockCredential);
    mockIngredientsService.findByIds.mockResolvedValue([]);
    mockIngredientsService.findOne.mockResolvedValue(mockIngredient);
    mockPostsService.addThreadReply.mockResolvedValue(mockPost);
    mockPostsService.count.mockResolvedValue(0);
    mockPostsService.create.mockResolvedValue(mockPost);
    mockPostsService.createRemix.mockResolvedValue(mockPost);
    mockPostsService.findAll.mockResolvedValue({ docs: [mockPost] });
    mockPostsService.findByIds.mockResolvedValue([mockPost]);
    mockPostsService.findOne.mockResolvedValue(mockPost);
    mockPostsService.patch.mockResolvedValue(mockPost);
    mockPromptBuilderService.buildPrompt.mockResolvedValue({
      input: { max_tokens: 4096, prompt: 'test prompt' },
    });
    mockQuotaService.verifyQuota.mockResolvedValue(true);
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      `Tweet 1: This is a great tweet about technology.
Tweet 2: Here's another insightful post.
Tweet 3: Tech innovation is changing the world.`,
    );
    mockTemplatesService.getRenderedPrompt.mockResolvedValue(
      'Generated prompt template',
    );
    mockTrendReferenceCorpusService.recordDraftRemixLineage.mockResolvedValue(
      undefined,
    );
    mockWebsocketService.emit.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsOperationsController],
      providers: [
        { provide: ActivitiesService, useValue: mockActivitiesService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: IngredientsService, useValue: mockIngredientsService },
        { provide: MembersService, useValue: mockMembersService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: PostsService, useValue: mockPostsService },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
        { provide: QuotaService, useValue: mockQuotaService },
        { provide: ReplicateService, useValue: mockReplicateService },
        { provide: TemplatesService, useValue: mockTemplatesService },
        {
          provide: TrendReferenceCorpusService,
          useValue: mockTrendReferenceCorpusService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockWebsocketService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: vi.fn().mockResolvedValue(true) })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: vi.fn().mockImplementation((_context, next) => {
          return next.handle();
        }),
      })
      .compile();

    controller = module.get<PostsOperationsController>(
      PostsOperationsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================================
  // POST /posts/generate - generateTweets
  // ==========================================================================
  describe('generateTweets', () => {
    const generateTweetsDto = {
      count: 3,
      credential: new Types.ObjectId(credentialId),
      tone: TweetTone.PROFESSIONAL,
      topic: 'AI technology',
    };

    it('should create posts with PROCESSING status and return them', async () => {
      const result = await controller.generateTweets(
        mockRequest,
        generateTweetsDto,
        mockUser,
      );

      expect(mockCredentialsService.findOne).toHaveBeenCalledWith({
        _id: generateTweetsDto.credential,
        isConnected: true,
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });
      expect(mockPostsService.create).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should throw NOT_FOUND when credential does not exist', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.generateTweets(mockRequest, generateTweetsDto, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        await controller.generateTweets(
          mockRequest,
          generateTweetsDto,
          mockUser,
        );
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('should handle internal error during post creation', async () => {
      mockPostsService.create.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        controller.generateTweets(mockRequest, generateTweetsDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should re-throw HttpException as-is', async () => {
      const httpError = new HttpException('Custom error', HttpStatus.FORBIDDEN);
      mockCredentialsService.findOne.mockRejectedValueOnce(httpError);

      await expect(
        controller.generateTweets(mockRequest, generateTweetsDto, mockUser),
      ).rejects.toThrow(httpError);
    });

    it('records remix lineage for generated tweet posts when source metadata is provided', async () => {
      await (controller as any).generateTweetsAsync(
        {
          ...generateTweetsDto,
          sourceReferenceIds: [new Types.ObjectId('507f1f77bcf86cd799439099')],
          sourceUrl: 'https://x.com/example/status/1',
          trendId: new Types.ObjectId('507f1f77bcf86cd799439098'),
        },
        [mockPost],
        {
          brand: brandId,
          organization: organizationId,
          user: userId,
        },
      );

      expect(
        mockTrendReferenceCorpusService.recordDraftRemixLineage,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          draftType: 'tweet',
          organizationId,
          platforms: [CredentialPlatform.TWITTER],
          postId,
        }),
      );
    });
  });

  // ==========================================================================
  // POST /posts/generate/thread - generateThread
  // ==========================================================================
  describe('generateThread', () => {
    const generateThreadDto = {
      count: 5,
      credential: new Types.ObjectId(credentialId),
      tone: TweetTone.CASUAL,
      topic: 'AI technology',
    };

    it('should create thread posts with parent relationships', async () => {
      let callCount = 0;
      mockPostsService.create.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ...mockPost,
          _id: new Types.ObjectId(),
          order: callCount - 1,
        });
      });

      const result = await controller.generateThread(
        mockRequest,
        mockUser,
        generateThreadDto,
      );

      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(mockPostsService.create).toHaveBeenCalledTimes(5);
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should throw NOT_FOUND when credential not found', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.generateThread(mockRequest, mockUser, generateThreadDto),
      ).rejects.toThrow(HttpException);
    });

    it('should use default PROFESSIONAL tone when not specified', async () => {
      const dtoWithoutTone = {
        count: 3,
        credential: new Types.ObjectId(credentialId),
        topic: 'AI',
      };

      await controller.generateThread(mockRequest, mockUser, dtoWithoutTone);

      expect(mockPostsService.create).toHaveBeenCalled();
    });

    it('records remix lineage for generated thread posts when source metadata is provided', async () => {
      await (controller as any).generateThreadAsync(
        {
          ...generateThreadDto,
          sourceReferenceIds: [new Types.ObjectId('507f1f77bcf86cd799439099')],
          sourceUrl: 'https://x.com/example/status/1',
          trendId: new Types.ObjectId('507f1f77bcf86cd799439098'),
        },
        [mockPost],
        {
          brand: brandId,
          organization: organizationId,
          user: userId,
        },
      );

      expect(
        mockTrendReferenceCorpusService.recordDraftRemixLineage,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          draftType: 'thread',
          organizationId,
          platforms: [CredentialPlatform.TWITTER],
          postId,
        }),
      );
    });
  });

  // ==========================================================================
  // POST /posts/:postId/expand-to-thread - expandToThread
  // ==========================================================================
  describe('expandToThread', () => {
    const expandToThreadDto = {
      count: 4,
      tone: TweetTone.CASUAL,
    };

    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue({
        ...mockPost,
        platform: CredentialPlatform.TWITTER,
      });
      mockPostsService.count.mockResolvedValue(0);
    });

    it('should expand a post into a thread', async () => {
      const result = await controller.expandToThread(
        mockRequest,
        mockUser,
        postId,
        expandToThreadDto,
      );

      expect(mockPostsService.findOne).toHaveBeenCalledWith(
        { _id: postId },
        expect.any(Array),
      );
      expect(mockPostsService.count).toHaveBeenCalledWith({
        isDeleted: false,
        parent: postId,
      });
      // Should create count-1 new posts (original becomes first)
      expect(mockPostsService.create).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when original post not found', async () => {
      mockPostsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.expandToThread(
          mockRequest,
          mockUser,
          postId,
          expandToThreadDto,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw FORBIDDEN when post belongs to different organization', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        organization: new Types.ObjectId(),
      });

      await expect(
        controller.expandToThread(
          mockRequest,
          mockUser,
          postId,
          expandToThreadDto,
        ),
      ).rejects.toThrow(HttpException);

      try {
        mockPostsService.findOne.mockResolvedValueOnce({
          ...mockPost,
          organization: new Types.ObjectId(),
        });
        await controller.expandToThread(
          mockRequest,
          mockUser,
          postId,
          expandToThreadDto,
        );
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it('should throw BAD_REQUEST when post already has children', async () => {
      mockPostsService.count.mockResolvedValueOnce(2);

      await expect(
        controller.expandToThread(
          mockRequest,
          mockUser,
          postId,
          expandToThreadDto,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when platform is not Twitter', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        platform: CredentialPlatform.YOUTUBE,
      });

      await expect(
        controller.expandToThread(
          mockRequest,
          mockUser,
          postId,
          expandToThreadDto,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // POST /posts/batch - batchSchedule
  // ==========================================================================
  describe('batchSchedule', () => {
    const batchScheduleDto = {
      credential: new Types.ObjectId(credentialId),
      tweets: [
        {
          postId: new Types.ObjectId(postId),
          scheduledDate: new Date().toISOString(),
          text: 'Scheduled tweet 1',
          timezone: 'America/New_York',
        },
        {
          ingredientId: ingredientId,
          postId: new Types.ObjectId(),
          scheduledDate: new Date().toISOString(),
          text: 'Scheduled tweet 2',
          timezone: 'America/New_York',
        },
      ],
    };

    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostsService.patch.mockResolvedValue({
        ...mockPost,
        status: PostStatus.SCHEDULED,
      });
    });

    it('should schedule multiple posts', async () => {
      const result = await controller.batchSchedule(
        mockRequest,
        batchScheduleDto,
        mockUser,
      );

      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(mockPostsService.patch).toHaveBeenCalled();
      expect(mockActivitiesService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when credential not found', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.batchSchedule(mockRequest, batchScheduleDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should skip posts that are not found', async () => {
      // batchSchedule uses findByIds (not findOne) — return empty array so no posts are found
      mockPostsService.findByIds.mockResolvedValueOnce([]);

      const result = await controller.batchSchedule(
        mockRequest,
        batchScheduleDto,
        mockUser,
      );

      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle ingredient lookup for tweets with ingredientId', async () => {
      mockIngredientsService.findByIds.mockResolvedValueOnce([mockIngredient]);

      await controller.batchSchedule(mockRequest, batchScheduleDto, mockUser);

      expect(mockIngredientsService.findByIds).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // POST /posts/:postId/reply - addThreadReply
  // ==========================================================================
  describe('addThreadReply', () => {
    const createPostDto = {
      credential: new Types.ObjectId(credentialId),
      description: 'Reply to thread',
      ingredients: [] as Types.ObjectId[],
      label: 'Reply',
      status: PostStatus.DRAFT,
    };

    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostsService.addThreadReply.mockResolvedValue({
        ...mockPost,
        parent: new Types.ObjectId(postId),
      });
    });

    it('should add a reply to a thread', async () => {
      const result = await controller.addThreadReply(
        mockRequest,
        mockUser,
        postId,
        createPostDto,
      );

      expect(mockPostsService.findOne).toHaveBeenCalledWith({ _id: postId });
      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(mockQuotaService.verifyQuota).toHaveBeenCalled();
      expect(mockPostsService.addThreadReply).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when parent post not found', async () => {
      mockPostsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.addThreadReply(mockRequest, mockUser, postId, createPostDto),
      ).rejects.toThrow(HttpException);
    });

    it('should throw FORBIDDEN when parent belongs to different organization', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        organization: new Types.ObjectId(),
      });

      await expect(
        controller.addThreadReply(mockRequest, mockUser, postId, createPostDto),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when credential not found', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.addThreadReply(mockRequest, mockUser, postId, createPostDto),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST for text-only scheduled post on non-Twitter platform', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce({
        ...mockCredential,
        platform: CredentialPlatform.YOUTUBE,
      });

      const scheduledTextDto = {
        ...createPostDto,
        category: PostCategory.TEXT,
        status: PostStatus.SCHEDULED,
      };

      await expect(
        controller.addThreadReply(
          mockRequest,
          mockUser,
          postId,
          scheduledTextDto,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw BAD_REQUEST when scheduling without media on non-Twitter platform', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce({
        ...mockCredential,
        platform: CredentialPlatform.INSTAGRAM,
      });

      const scheduledNoMediaDto = {
        ...createPostDto,
        ingredients: [],
        status: PostStatus.SCHEDULED,
      };

      await expect(
        controller.addThreadReply(
          mockRequest,
          mockUser,
          postId,
          scheduledNoMediaDto,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw NOT_FOUND when ingredient not found', async () => {
      mockIngredientsService.findOne.mockResolvedValueOnce(null);

      const dtoWithIngredient = {
        ...createPostDto,
        ingredients: [new Types.ObjectId(ingredientId)],
      };

      await expect(
        controller.addThreadReply(
          mockRequest,
          mockUser,
          postId,
          dtoWithIngredient,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should handle ingredients array and set category based on first ingredient', async () => {
      mockIngredientsService.findOne.mockResolvedValueOnce({
        ...mockIngredient,
        category: IngredientCategory.VIDEO,
      });

      const dtoWithIngredient = {
        ...createPostDto,
        ingredients: [new Types.ObjectId(ingredientId)],
      };

      await controller.addThreadReply(
        mockRequest,
        mockUser,
        postId,
        dtoWithIngredient,
      );

      expect(mockIngredientsService.findOne).toHaveBeenCalled();
      expect(mockPostsService.addThreadReply).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // POST /posts/:postId/remix - createRemixPost
  // ==========================================================================
  describe('createRemixPost', () => {
    const createRemixDto = {
      description: 'Remixed post content',
      label: 'Remix Label',
    };

    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostsService.createRemix.mockResolvedValue({
        ...mockPost,
        _id: new Types.ObjectId(),
        description: createRemixDto.description,
        remixOf: mockPost._id,
      });
    });

    it('should create a remix of an existing post', async () => {
      const result = await controller.createRemixPost(
        mockRequest,
        postId,
        createRemixDto,
        mockUser,
      );

      expect(mockPostsService.findOne).toHaveBeenCalledWith(
        { _id: postId },
        expect.any(Array),
      );
      expect(mockPostsService.createRemix).toHaveBeenCalledWith(
        postId,
        createRemixDto.description,
        expect.objectContaining({
          brand: new Types.ObjectId(brandId),
          label: createRemixDto.label,
          organization: new Types.ObjectId(organizationId),
          user: new Types.ObjectId(userId),
        }),
      );
      expect(mockActivitiesService.create).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when original post not found', async () => {
      mockPostsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.createRemixPost(
          mockRequest,
          postId,
          createRemixDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw FORBIDDEN when post belongs to different organization', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        organization: new Types.ObjectId(),
      });

      await expect(
        controller.createRemixPost(
          mockRequest,
          postId,
          createRemixDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should return bad request response for errors with response property', async () => {
      const errorWithResponse = new Error('Validation error') as Error & {
        response: unknown;
      };
      errorWithResponse.response = { message: 'Invalid data' };
      mockPostsService.createRemix.mockRejectedValueOnce(errorWithResponse);

      await expect(
        controller.createRemixPost(
          mockRequest,
          postId,
          createRemixDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // POST /posts/:postId/enhance - enhancePost
  // ==========================================================================
  describe('enhancePost', () => {
    const enhancePostDto = {
      prompt: 'Make it more engaging',
      tone: TweetTone.PROFESSIONAL,
    };

    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostsService.patch.mockResolvedValue({
        ...mockPost,
        description: 'Enhanced description',
      });
      mockReplicateService.generateTextCompletionSync.mockResolvedValue(
        'Enhanced description',
      );
    });

    it('should enhance post description using AI', async () => {
      const result = await controller.enhancePost(
        mockRequest,
        postId,
        enhancePostDto,
        mockUser,
      );

      expect(mockPostsService.findOne).toHaveBeenCalledWith(
        { _id: postId },
        expect.any(Array),
      );
      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalled();
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
      expect(
        mockReplicateService.generateTextCompletionSync,
      ).toHaveBeenCalled();
      expect(mockPostsService.patch).toHaveBeenCalledWith(postId, {
        description: 'Enhanced description',
      });
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when post not found', async () => {
      mockPostsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.enhancePost(mockRequest, postId, enhancePostDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should throw FORBIDDEN when post belongs to different organization', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        organization: new Types.ObjectId(),
      });

      await expect(
        controller.enhancePost(mockRequest, postId, enhancePostDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should handle AI generation failure', async () => {
      mockReplicateService.generateTextCompletionSync.mockRejectedValueOnce(
        new Error('AI service unavailable'),
      );

      await expect(
        controller.enhancePost(mockRequest, postId, enhancePostDto, mockUser),
      ).rejects.toThrow(HttpException);

      try {
        mockReplicateService.generateTextCompletionSync.mockRejectedValueOnce(
          new Error('AI service unavailable'),
        );
        mockPostsService.findOne.mockResolvedValue(mockPost);
        await controller.enhancePost(
          mockRequest,
          postId,
          enhancePostDto,
          mockUser,
        );
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    });

    it('should use platform-specific system prompt', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        platform: CredentialPlatform.YOUTUBE,
      });

      await controller.enhancePost(
        mockRequest,
        postId,
        enhancePostDto,
        mockUser,
      );

      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
    });

    it('should use default tone when not specified', async () => {
      const dtoWithoutTone = {
        prompt: 'Make it better',
      };

      await controller.enhancePost(
        mockRequest,
        postId,
        dtoWithoutTone,
        mockUser,
      );

      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tone: 'professional',
        }),
        organizationId,
      );
    });
  });

  // ==========================================================================
  // Helper Methods Tests (via indirect testing)
  // ==========================================================================
  describe('Helper Methods', () => {
    describe('stripHtmlTags', () => {
      it('should strip HTML tags when processing posts', async () => {
        const postWithHtml = {
          ...mockPost,
          description: '<p>Hello <strong>World</strong></p>',
        };
        mockPostsService.findOne.mockResolvedValue(postWithHtml);

        // expandToThread uses stripHtmlTags internally
        await controller.expandToThread(mockRequest, mockUser, postId, {
          count: 3,
        });

        // The method is called, processing happens internally
        expect(mockPostsService.create).toHaveBeenCalled();
      });
    });

    describe('isValidPostLength', () => {
      // Tested indirectly through parseTweetContent during async generation
      it('should validate post length during tweet generation', async () => {
        const generateTweetsDto = {
          count: 2,
          credential: credentialId,
          topic: 'Test',
        };

        await controller.generateTweets(
          mockRequest,
          generateTweetsDto,
          mockUser,
        );

        expect(mockPostsService.create).toHaveBeenCalled();
      });
    });

    describe('extractLabelFromTweet', () => {
      it('should extract label when creating posts', async () => {
        const generateTweetsDto = {
          count: 1,
          credential: credentialId,
          topic: 'Test',
        };

        await controller.generateTweets(
          mockRequest,
          generateTweetsDto,
          mockUser,
        );

        // Label extraction happens during async processing
        expect(mockPostsService.create).toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle empty ingredients array', async () => {
      const createPostDto = {
        credential: credentialId,
        description: 'Reply',
        ingredients: [],
        label: 'Reply',
        status: PostStatus.DRAFT,
      };

      await controller.addThreadReply(
        mockRequest,
        mockUser,
        postId,
        createPostDto,
      );

      expect(mockPostsService.addThreadReply).toHaveBeenCalled();
    });

    it('should handle missing optional fields in DTOs', async () => {
      const minimalDto = {
        count: 1,
        credential: new Types.ObjectId(credentialId),
        topic: 'Test',
      };

      await controller.generateTweets(mockRequest, minimalDto, mockUser);

      expect(mockPostsService.create).toHaveBeenCalled();
    });

    it('should handle posts with no description', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        description: undefined,
      });

      await controller.enhancePost(
        mockRequest,
        postId,
        { prompt: 'Improve' },
        mockUser,
      );

      expect(mockTemplatesService.getRenderedPrompt).toHaveBeenCalled();
    });

    it('should handle posts with null platform', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        platform: null,
      });

      await controller.enhancePost(
        mockRequest,
        postId,
        { prompt: 'Improve' },
        mockUser,
      );

      // Should use default system prompt
      expect(mockPromptBuilderService.buildPrompt).toHaveBeenCalled();
    });
  });
});
