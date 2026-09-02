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

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { AccountPublishingContextService } from '@api/collections/credentials/services/account-publishing-context.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { PostsGenerationController } from '@api/collections/posts/controllers/operations/posts-generation.controller';
import { PostsOperationsController } from '@api/collections/posts/controllers/operations/posts-operations.controller';
import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { PostVariationSourceGuard } from '@api/collections/posts/guards/post-variation-source.guard';
import { PostGenerationService } from '@api/collections/posts/services/post-generation.service';
import { PostRepurposeService } from '@api/collections/posts/services/post-repurpose.service';
import { PostThreadGenerationService } from '@api/collections/posts/services/post-thread-generation.service';
import { PostVariationService } from '@api/collections/posts/services/post-variation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import type { SourcePostVariationRequest } from '@api/collections/posts/services/source-post-variation.types';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import {
  ApiKeyScope,
  ContentIntelligencePlatform,
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { AccountPublishingContext } from '@genfeedai/interfaces';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  INTERCEPTORS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('PostsOperationsController', () => {
  let controller: PostsOperationsController;
  let generationController: PostsGenerationController;

  // Mock IDs
  const userId = testId('user');
  const organizationId = testId('org');
  const brandId = testId('brand');
  const postId = testId('post');
  const credentialId = testId('credential');
  const ingredientId = testId('ingredient');

  const mockUser = {
    id: 'user_authProvider_123',
    brandId: brandId,
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const apiKeyUser = (scopes: string[]): User =>
    ({
      id: mockUser.id,
      brandId: brandId,
      isApiKey: true,
      organizationId: organizationId,
      scopes,
      userId: userId,
    }) as User;

  // Shaped like a Prisma row with canonical scalar foreign keys.
  const mockPost = {
    id: postId,
    brandId: brandId,
    category: PostCategory.TEXT,
    credentialId: credentialId,
    description: 'Test post description',
    isDeleted: false,
    organizationId: organizationId,
    parentId: undefined,
    platform: CredentialPlatform.TWITTER,
    status: PostStatus.DRAFT,
    userId: userId,
  };

  const mockCredential = {
    id: credentialId,
    handle: '@testaccount',
    isConnected: true,
    isDeleted: false,
    label: 'Twitter Account',
    organizationId: organizationId,
    platform: CredentialPlatform.TWITTER,
  };

  const mockPublishingContext = {
    account: {
      handle: 'testaccount',
      id: credentialId,
      label: 'Twitter Account',
      platform: CredentialPlatform.TWITTER,
    },
    brand: {
      id: brandId,
      label: 'Test Brand',
    },
    constraints: {
      maxWeightedCharacters: 280,
      notes: ['Standard X posts use the 280 weighted-character limit.'],
      supportsDirectPublishing: true,
      supportsRichArticleCopy: false,
      supportsThreads: true,
      usesWeightedCharacters: true,
    },
    promptHints: ['Account: Twitter Account', 'Platform: twitter'],
    publishability: 'publishable',
    readiness: {
      appReviewStatus: 'unknown',
      callbackUrlStatus: 'unknown',
      canSchedule: true,
      diagnostics: [],
      isRetryable: false,
      permissionScopeStatus: 'unknown',
      providerKey: CredentialPlatform.TWITTER,
      quotaStatus: 'unknown',
      state: 'publish_capable',
      tokenFreshness: 'pass',
    },
    recentPosts: [],
    surface: 'post',
  } satisfies AccountPublishingContext;

  const mockIngredient = {
    id: ingredientId,
    brandId: brandId,
    category: IngredientCategory.IMAGE,
    isDeleted: false,
    organizationId: organizationId,
    url: 'https://example.com/image.jpg',
  };

  const mockActivity = {
    id: testId('other'),
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
    createMany: vi.fn().mockResolvedValue(1),
    patch: vi.fn().mockResolvedValue(mockActivity),
  };

  const mockAccountPublishingContextService = {
    resolve: vi.fn().mockResolvedValue(mockPublishingContext),
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
    batchSchedule: vi
      .fn()
      .mockResolvedValue({ missingPostIds: [], posts: [mockPost] }),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue(mockPost),
    createRemix: vi.fn().mockResolvedValue(mockPost),
    findAll: vi.fn().mockResolvedValue({ docs: [mockPost] }),
    findByIds: vi.fn().mockResolvedValue([mockPost]),
    findOne: vi.fn().mockResolvedValue(mockPost),
    patch: vi.fn().mockResolvedValue(mockPost),
  };

  const mockPostThreadGenerationService = {
    expandThread: vi.fn().mockResolvedValue(undefined),
  };
  const mockPostVariationService = { generate: vi.fn() };

  const mockPromptBuilderService = {
    buildPrompt: vi.fn().mockResolvedValue({
      input: { max_tokens: 4096, prompt: 'test prompt' },
    }),
  };

  const mockQuotaService = {
    verifyQuota: vi.fn().mockResolvedValue(true),
  };

  const mockSeoScorerService = {
    scorePost: vi.fn().mockResolvedValue({
      score: 82,
    }),
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
    recordPostRemixLineage: vi.fn().mockResolvedValue(undefined),
  };

  const mockWebsocketService = {
    emit: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockActivitiesService.create.mockResolvedValue(mockActivity);
    mockActivitiesService.patch.mockResolvedValue(mockActivity);
    mockAccountPublishingContextService.resolve.mockResolvedValue(
      mockPublishingContext,
    );
    mockCredentialsService.findOne.mockResolvedValue(mockCredential);
    mockIngredientsService.findByIds.mockResolvedValue([]);
    mockIngredientsService.findOne.mockResolvedValue(mockIngredient);
    mockActivitiesService.createMany.mockResolvedValue(1);
    mockPostsService.addThreadReply.mockResolvedValue(mockPost);
    mockPostsService.batchSchedule.mockResolvedValue({
      missingPostIds: [],
      posts: [mockPost],
    });
    mockPostsService.count.mockResolvedValue(0);
    mockPostsService.create.mockResolvedValue(mockPost);
    mockPostsService.createRemix.mockResolvedValue(mockPost);
    mockPostsService.findAll.mockResolvedValue({ docs: [mockPost] });
    mockPostsService.findByIds.mockResolvedValue([mockPost]);
    mockPostsService.findOne.mockResolvedValue(mockPost);
    mockPostsService.patch.mockResolvedValue(mockPost);
    mockPostThreadGenerationService.expandThread.mockResolvedValue(undefined);
    mockPromptBuilderService.buildPrompt.mockResolvedValue({
      input: { max_tokens: 4096, prompt: 'test prompt' },
    });
    mockQuotaService.verifyQuota.mockResolvedValue(true);
    mockSeoScorerService.scorePost.mockResolvedValue({
      score: 82,
    });
    mockReplicateService.generateTextCompletionSync.mockResolvedValue(
      `Tweet 1: This is a great tweet about technology.
Tweet 2: Here's another insightful post.
Tweet 3: Tech innovation is changing the world.`,
    );
    mockTemplatesService.getRenderedPrompt.mockResolvedValue(
      'Generated prompt template',
    );
    mockTrendReferenceCorpusService.recordPostRemixLineage.mockResolvedValue(
      undefined,
    );
    mockWebsocketService.emit.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostsGenerationController, PostsOperationsController],
      providers: [
        {
          provide: AccountPublishingContextService,
          useValue: mockAccountPublishingContextService,
        },
        { provide: ActivitiesService, useValue: mockActivitiesService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: IngredientsService, useValue: mockIngredientsService },
        { provide: MembersService, useValue: mockMembersService },
        { provide: LoggerService, useValue: mockLoggerService },
        PostGenerationService,
        {
          provide: PostRepurposeService,
          useValue: { repurpose: vi.fn() },
        },
        {
          provide: PostThreadGenerationService,
          useValue: mockPostThreadGenerationService,
        },
        {
          provide: PostVariationService,
          useValue: mockPostVariationService,
        },
        { provide: PostsService, useValue: mockPostsService },
        { provide: PromptBuilderService, useValue: mockPromptBuilderService },
        { provide: QuotaService, useValue: mockQuotaService },
        { provide: ReplicateService, useValue: mockReplicateService },
        { provide: SeoScorerService, useValue: mockSeoScorerService },
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
      .overrideGuard(PostVariationSourceGuard)
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
    generationController = module.get<PostsGenerationController>(
      PostsGenerationController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
    expect(generationController).toBeDefined();
  });

  it.each([
    ['generateAccountContent', 'account-generations'],
    ['generateSourceVariations', 'source-variations'],
    ['expandToThread', ':postId/thread-expansions'],
    ['enhancePost', ':postId/enhancements'],
    ['repurposePost', ':postId/repurpose'],
    ['scoreSeo', ':postId/seo-scores'],
    ['generateHookVariations', 'hook-generations'],
  ] as const)(
    'keeps %s registered as POST /posts/%s on the generation controller',
    (methodName, path) => {
      const handler = PostsGenerationController.prototype[methodName];

      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
        RequestMethod.POST,
      );
      expect(
        PostsOperationsController.prototype[
          methodName as keyof PostsOperationsController
        ],
      ).toBeUndefined();
    },
  );

  it('keeps the shared posts route prefix and role guard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, PostsGenerationController)).toBe(
      'posts',
    );
    expect(Reflect.getMetadata(PATH_METADATA, PostsOperationsController)).toBe(
      'posts',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PostsGenerationController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PostsOperationsController),
    ).toContain(RolesGuard);
  });

  it.each([
    'expandToThread',
    'enhancePost',
    'repurposePost',
    'scoreSeo',
    'generateHookVariations',
  ] as const)(
    'preserves credits guards and interceptor on %s',
    (methodName) => {
      const handler = PostsGenerationController.prototype[methodName];

      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        SubscriptionGuard,
        CreditsGuard,
      ]);
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toEqual([
        CreditsInterceptor,
      ]);
    },
  );

  it('keeps source authorization ahead of subscription and credit guards', () => {
    const handler =
      PostsGenerationController.prototype.generateSourceVariations;

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
      PostVariationSourceGuard,
      SubscriptionGuard,
      CreditsGuard,
    ]);
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, handler)).toEqual([
      CreditsInterceptor,
    ]);
  });

  it('serializes generated variations and reconciles credits to actual output', async () => {
    mockPostVariationService.generate.mockResolvedValue({
      meta: {
        actualCount: 2,
        creditCost: 2,
        groupId: 'group-1',
        requestedCount: 3,
        reviewBatchId: 'batch-1',
        sourceKind: 'owned-post',
        voiceMode: 'brand-voice',
        voiceModeLabel: 'Brand voice',
      },
      posts: [
        { ...mockPost, id: 'variation-1' },
        { ...mockPost, id: 'variation-2' },
      ],
    });
    const request = {
      ...mockRequest,
      creditsConfig: {
        amount: 3,
        description: 'Source post variation',
      },
      resolvedPostVariationSource: {
        id: postId,
        kind: 'owned-post',
        text: mockPost.description,
      },
    } as unknown as SourcePostVariationRequest & {
      creditsConfig: { amount: number; description: string };
    };

    const result = await generationController.generateSourceVariations(
      request,
      mockUser,
      {
        count: 3,
        platform: ContentIntelligencePlatform.TWITTER,
        postId,
      },
    );

    expect(mockPostVariationService.generate).toHaveBeenCalledWith(
      expect.objectContaining({ count: 3, source: expect.any(Object) }),
    );
    expect(result.meta).toMatchObject({ actualCount: 2, requestedCount: 3 });
    expect(request.creditsConfig.amount).toBe(2);
  });

  // ==========================================================================
  // POST /posts/account-generations - generateAccountContent (post format)
  // ==========================================================================
  describe('generateAccountContent (post format)', () => {
    const generateTweetsDto = {
      count: 3,
      credentialId,
      format: 'post' as const,
      tone: TweetTone.PROFESSIONAL,
      topic: 'AI technology',
    };

    it('should create posts with PROCESSING status and return them', async () => {
      const result = await generationController.generateAccountContent(
        mockRequest,
        generateTweetsDto,
        mockUser,
      );

      expect(mockAccountPublishingContextService.resolve).toHaveBeenCalledWith({
        brandId,
        credentialId: generateTweetsDto.credentialId,
        organizationId,
        sourceLineage: {
          sourceReferenceIds: undefined,
          sourceUrl: undefined,
          trendId: undefined,
        },
        surface: 'post',
      });
      expect(mockPostsService.create).toHaveBeenCalledTimes(3);
      expect(mockPostsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: CredentialPlatform.TWITTER,
        }),
      );
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should throw NOT_FOUND when credential does not exist', async () => {
      const notFoundError = new HttpException(
        {
          detail: 'The specified account does not exist or is not connected',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
      mockAccountPublishingContextService.resolve
        .mockRejectedValueOnce(notFoundError)
        .mockRejectedValueOnce(notFoundError);

      await expect(
        generationController.generateAccountContent(
          mockRequest,
          generateTweetsDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);

      try {
        await generationController.generateAccountContent(
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
        generationController.generateAccountContent(
          mockRequest,
          generateTweetsDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should re-throw HttpException as-is', async () => {
      const httpError = new HttpException('Custom error', HttpStatus.FORBIDDEN);
      mockAccountPublishingContextService.resolve.mockRejectedValueOnce(
        httpError,
      );

      await expect(
        generationController.generateAccountContent(
          mockRequest,
          generateTweetsDto,
          mockUser,
        ),
      ).rejects.toThrow(httpError);
    });

    it('uses the selected account platform when creating generated drafts', async () => {
      mockAccountPublishingContextService.resolve.mockResolvedValueOnce({
        ...mockPublishingContext,
        account: {
          ...mockPublishingContext.account,
          platform: CredentialPlatform.LINKEDIN,
        },
      });

      await generationController.generateAccountContent(
        mockRequest,
        generateTweetsDto,
        mockUser,
      );

      expect(mockPostsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: CredentialPlatform.LINKEDIN,
        }),
      );
    });
  });

  // ==========================================================================
  // POST /posts/account-generations - generateAccountContent (thread format)
  // ==========================================================================
  describe('generateAccountContent (thread format)', () => {
    const generateThreadDto = {
      count: 5,
      credentialId,
      format: 'thread' as const,
      tone: TweetTone.CASUAL,
      topic: 'AI technology',
    };

    it('should create thread posts with parent relationships', async () => {
      let callCount = 0;
      mockPostsService.create.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ...mockPost,
          id: testId('other'),
          order: callCount - 1,
        });
      });

      const result = await generationController.generateAccountContent(
        mockRequest,
        generateThreadDto,
        mockUser,
      );

      expect(mockAccountPublishingContextService.resolve).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId,
          credentialId: generateThreadDto.credentialId,
          organizationId,
          surface: 'thread',
        }),
      );
      expect(mockPostsService.create).toHaveBeenCalledTimes(5);
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
    });

    it('should throw NOT_FOUND when credential not found', async () => {
      mockAccountPublishingContextService.resolve.mockRejectedValueOnce(
        new HttpException(
          {
            detail: 'The specified account does not exist or is not connected',
            title: 'Credential not found',
          },
          HttpStatus.NOT_FOUND,
        ),
      );

      await expect(
        generationController.generateAccountContent(
          mockRequest,
          generateThreadDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should use default PROFESSIONAL tone when not specified', async () => {
      const dtoWithoutTone = {
        count: 3,
        credentialId,
        format: 'thread' as const,
        topic: 'AI',
      };

      await generationController.generateAccountContent(
        mockRequest,
        dtoWithoutTone,
        mockUser,
      );

      expect(mockPostsService.create).toHaveBeenCalled();
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
      const result = await generationController.expandToThread(
        mockRequest,
        mockUser,
        postId,
        expandToThreadDto,
      );

      expect(mockPostsService.findOne).toHaveBeenCalledWith(
        { id: postId },
        expect.any(Array),
      );
      expect(mockPostsService.count).toHaveBeenCalledWith(organizationId, {
        parentId: postId,
      });
      // Should create count-1 new posts (original becomes first)
      expect(mockPostsService.create).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when original post not found', async () => {
      mockPostsService.findOne.mockResolvedValueOnce(null);

      await expect(
        generationController.expandToThread(
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
        organizationId: testId('other'),
      });

      await expect(
        generationController.expandToThread(
          mockRequest,
          mockUser,
          postId,
          expandToThreadDto,
        ),
      ).rejects.toThrow(HttpException);

      try {
        mockPostsService.findOne.mockResolvedValueOnce({
          ...mockPost,
          organizationId: testId('other'),
        });
        await generationController.expandToThread(
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
        generationController.expandToThread(
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
        generationController.expandToThread(
          mockRequest,
          mockUser,
          postId,
          expandToThreadDto,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  // ==========================================================================
  // PATCH /posts/batch - batchUpdate
  // ==========================================================================
  describe('batchUpdate', () => {
    const batchScheduleDto = {
      credentialId,
      items: [
        {
          postId: postId,
          scheduledDate: new Date().toISOString(),
          text: 'Scheduled tweet 1',
          timezone: 'America/New_York',
        },
        {
          ingredientId: ingredientId,
          postId: testId('other'),
          scheduledDate: new Date().toISOString(),
          text: 'Scheduled tweet 2',
          timezone: 'America/New_York',
        },
      ],
    };

    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostsService.batchSchedule.mockResolvedValue({
        missingPostIds: [],
        posts: [
          { ...mockPost, status: PostStatus.SCHEDULED },
          {
            ...mockPost,
            id: testId('other'),
            status: PostStatus.SCHEDULED,
          },
        ],
      });
    });

    it('should schedule the whole batch with one service call', async () => {
      const result = await controller.batchUpdate(
        mockRequest,
        batchScheduleDto,
        mockUser,
      );

      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(mockPostsService.batchSchedule).toHaveBeenCalledTimes(1);
      expect(mockPostsService.batchSchedule).toHaveBeenCalledWith(
        [
          expect.objectContaining({ postId, text: 'Scheduled tweet 1' }),
          expect.objectContaining({
            postId: testId('other'),
            text: 'Scheduled tweet 2',
          }),
        ],
        organizationId,
        {
          credentialId,
          platform: CredentialPlatform.TWITTER,
        },
        mockUser.id,
      );
      expect(mockPostsService.patch).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it.each([
      ['a missing scope list', []],
      ['the legacy draft scope', [ApiKeyScope.POSTS_CREATE]],
      ['a whitespace-prefixed scope', [` ${ApiKeyScope.POSTS_SCHEDULE}`]],
    ])(
      'rejects API-key batch scheduling with %s before reads or writes',
      async (_case, scopes) => {
        await expect(
          controller.batchUpdate(
            mockRequest,
            batchScheduleDto,
            apiKeyUser(scopes),
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
            requiredScopes: [ApiKeyScope.POSTS_SCHEDULE],
          }),
        });
        expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
        expect(mockPostsService.batchSchedule).not.toHaveBeenCalled();
      },
    );

    it('should record every scheduled activity in one insert', async () => {
      await controller.batchUpdate(mockRequest, batchScheduleDto, mockUser);

      expect(mockActivitiesService.createMany).toHaveBeenCalledTimes(1);
      expect(mockActivitiesService.create).not.toHaveBeenCalled();
      expect(mockActivitiesService.createMany.mock.calls[0]?.[0]).toHaveLength(
        2,
      );
    });

    it('should throw NOT_FOUND when credential not found', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.batchUpdate(mockRequest, batchScheduleDto, mockUser),
      ).rejects.toThrow(HttpException);
    });

    it('should skip posts that are not found', async () => {
      // The scoped read inside batchSchedule reports ids outside the
      // organization instead of the controller probing each one.
      mockPostsService.batchSchedule.mockResolvedValueOnce({
        missingPostIds: [postId, testId('other')],
        posts: [],
      });

      const result = await controller.batchUpdate(
        mockRequest,
        batchScheduleDto,
        mockUser,
      );

      expect(mockLoggerService.warn).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should handle ingredient lookup for items with ingredientId', async () => {
      mockIngredientsService.findByIds.mockResolvedValueOnce([mockIngredient]);

      await controller.batchUpdate(mockRequest, batchScheduleDto, mockUser);

      expect(mockIngredientsService.findByIds).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // POST /posts/:postId/reply - addThreadReply
  // ==========================================================================
  describe('addThreadReply', () => {
    const createPostDto = {
      credentialId,
      description: 'Reply to thread',
      ingredients: [] as string[],
      label: 'Reply',
      targetExecutionState: TargetExecutionState.DRAFT,
    };

    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
      mockPostsService.addThreadReply.mockResolvedValue({
        ...mockPost,
        parentId: postId,
      });
    });

    it('should add a reply to a thread', async () => {
      const result = await controller.addThreadReply(
        mockRequest,
        mockUser,
        postId,
        createPostDto,
      );

      expect(mockPostsService.findOne).toHaveBeenCalledWith({ id: postId });
      expect(mockCredentialsService.findOne).toHaveBeenCalled();
      expect(mockQuotaService.verifyQuota).toHaveBeenCalled();
      expect(mockPostsService.addThreadReply).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it.each([
      [
        'draft replies without a draft scope',
        TargetExecutionState.DRAFT,
        [],
        [ApiKeyScope.POSTS_DRAFT, ApiKeyScope.POSTS_CREATE],
      ],
      [
        'scheduled replies with only the draft scope',
        TargetExecutionState.SCHEDULED,
        [ApiKeyScope.POSTS_DRAFT],
        [ApiKeyScope.POSTS_SCHEDULE],
      ],
      [
        'published replies with only the schedule scope',
        TargetExecutionState.PUBLISHED,
        [ApiKeyScope.POSTS_SCHEDULE],
        [ApiKeyScope.POSTS_PUBLISH],
      ],
    ])(
      'rejects API-key %s before reads or writes',
      async (_case, executionState, scopes, requiredScopes) => {
        await expect(
          controller.addThreadReply(mockRequest, apiKeyUser(scopes), postId, {
            ...createPostDto,
            targetExecutionState: executionState,
          }),
        ).rejects.toMatchObject({
          response: expect.objectContaining({
            code: 'API_KEY_PUBLISHING_SCOPE_REQUIRED',
            requiredScopes,
          }),
        });
        expect(mockPostsService.findOne).not.toHaveBeenCalled();
        expect(mockCredentialsService.findOne).not.toHaveBeenCalled();
        expect(mockPostsService.addThreadReply).not.toHaveBeenCalled();
      },
    );

    it('should throw NOT_FOUND when parent post not found', async () => {
      mockPostsService.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.addThreadReply(mockRequest, mockUser, postId, createPostDto),
      ).rejects.toThrow(HttpException);
    });

    it('should throw FORBIDDEN when parent belongs to different organization', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        organizationId: testId('other'),
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
        targetExecutionState: TargetExecutionState.SCHEDULED,
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
        targetExecutionState: TargetExecutionState.SCHEDULED,
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

    it('should allow scheduled text-only Threads replies', async () => {
      mockCredentialsService.findOne.mockResolvedValueOnce({
        ...mockCredential,
        platform: CredentialPlatform.THREADS,
      });

      const scheduledTextDto = {
        ...createPostDto,
        category: PostCategory.TEXT,
        ingredients: [],
        targetExecutionState: TargetExecutionState.SCHEDULED,
      };

      await controller.addThreadReply(
        mockRequest,
        mockUser,
        postId,
        scheduledTextDto,
      );

      expect(mockPostsService.addThreadReply).toHaveBeenCalledWith(
        postId,
        expect.objectContaining({
          platform: CredentialPlatform.THREADS,
          targetExecutionState: TargetExecutionState.SCHEDULED,
        }),
      );
    });

    it('should throw NOT_FOUND when ingredient not found', async () => {
      mockIngredientsService.findOne.mockResolvedValueOnce(null);

      const dtoWithIngredient = {
        ...createPostDto,
        ingredients: [ingredientId],
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
        ingredients: [ingredientId],
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
        id: testId('other'),
        description: createRemixDto.description,
        remixOf: mockPost.id,
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
        { id: postId },
        expect.any(Array),
      );
      expect(mockPostsService.createRemix).toHaveBeenCalledWith(
        postId,
        createRemixDto.description,
        expect.objectContaining({
          brandId,
          label: createRemixDto.label,
          organizationId,
          userId,
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
        organizationId: testId('other'),
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
      const result = await generationController.enhancePost(
        mockRequest,
        postId,
        enhancePostDto,
        mockUser,
      );

      expect(mockPostsService.findOne).toHaveBeenCalledWith(
        { id: postId },
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
        generationController.enhancePost(
          mockRequest,
          postId,
          enhancePostDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should throw FORBIDDEN when post belongs to different organization', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        organizationId: testId('other'),
      });

      await expect(
        generationController.enhancePost(
          mockRequest,
          postId,
          enhancePostDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should handle AI generation failure', async () => {
      mockReplicateService.generateTextCompletionSync.mockRejectedValueOnce(
        new Error('AI service unavailable'),
      );

      await expect(
        generationController.enhancePost(
          mockRequest,
          postId,
          enhancePostDto,
          mockUser,
        ),
      ).rejects.toThrow(HttpException);

      try {
        mockReplicateService.generateTextCompletionSync.mockRejectedValueOnce(
          new Error('AI service unavailable'),
        );
        mockPostsService.findOne.mockResolvedValue(mockPost);
        await generationController.enhancePost(
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

      await generationController.enhancePost(
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

      await generationController.enhancePost(
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
  // POST /posts/:postId/seo-scores - scoreSeo
  // ==========================================================================
  describe('scoreSeo', () => {
    beforeEach(() => {
      mockPostsService.findOne.mockResolvedValue(mockPost);
    });

    it('scores post SEO and returns the refreshed post', async () => {
      const scoredPost = {
        ...mockPost,
        seoBreakdown: { rating: 'good' },
        seoScore: 82,
      };
      mockPostsService.findOne
        .mockResolvedValueOnce(mockPost)
        .mockResolvedValueOnce(scoredPost);

      const result = await generationController.scoreSeo(
        mockRequest,
        postId,
        { targetKeyword: 'workflow automation' },
        mockUser,
      );

      expect(mockPostsService.findOne).toHaveBeenNthCalledWith(
        1,
        { id: postId },
        expect.any(Array),
      );
      expect(mockSeoScorerService.scorePost).toHaveBeenCalledWith(
        postId,
        organizationId,
        'workflow automation',
      );
      expect(mockPostsService.findOne).toHaveBeenNthCalledWith(
        2,
        { id: postId },
        expect.any(Array),
      );
      expect(result).toEqual({ data: scoredPost });
    });

    it('throws NOT_FOUND when post is missing', async () => {
      mockPostsService.findOne.mockResolvedValueOnce(null);

      await expect(
        generationController.scoreSeo(mockRequest, postId, {}, mockUser),
      ).rejects.toThrow(HttpException);

      expect(mockSeoScorerService.scorePost).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when post belongs to another organization', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        organizationId: testId('other'),
      });

      await expect(
        generationController.scoreSeo(mockRequest, postId, {}, mockUser),
      ).rejects.toThrow(HttpException);

      expect(mockSeoScorerService.scorePost).not.toHaveBeenCalled();
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
        await generationController.expandToThread(
          mockRequest,
          mockUser,
          postId,
          {
            count: 3,
          },
        );

        // The method is called, processing happens internally
        expect(mockPostsService.create).toHaveBeenCalled();
      });
    });

    describe('isValidPostLength', () => {
      // Tested indirectly through parseTweetContent during async generation
      it('should validate post length during tweet generation', async () => {
        const generateTweetsDto = {
          count: 2,
          credentialId,
          format: 'post' as const,
          topic: 'Test',
        };

        await generationController.generateAccountContent(
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
          credentialId,
          format: 'post' as const,
          topic: 'Test',
        };

        await generationController.generateAccountContent(
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
        credentialId,
        description: 'Reply',
        ingredients: [],
        label: 'Reply',
        targetExecutionState: TargetExecutionState.DRAFT,
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
        credentialId,
        format: 'post' as const,
        topic: 'Test',
      };

      await generationController.generateAccountContent(
        mockRequest,
        minimalDto,
        mockUser,
      );

      expect(mockPostsService.create).toHaveBeenCalled();
    });

    it('should handle posts with no description', async () => {
      mockPostsService.findOne.mockResolvedValueOnce({
        ...mockPost,
        description: undefined,
      });

      await generationController.enhancePost(
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

      await generationController.enhancePost(
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
