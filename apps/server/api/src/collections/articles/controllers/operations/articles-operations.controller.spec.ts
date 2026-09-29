import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ArticlesOperationsController } from '@api/collections/articles/controllers/operations/articles-operations.controller';
import type { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';
import type { Article } from '@api/collections/articles/schemas/article.schema';
import { ArticleGenerationCreditsService } from '@api/collections/articles/services/article-generation-credits.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { ByokService } from '@api/services/byok/byok.service';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import {
  ActivityKey,
  ArticleCategory,
  AssetScope,
  ByokProvider,
  ModelCategory,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ArticlesOperationsController', () => {
  let controller: ArticlesOperationsController;
  let service: ArticlesService;

  const mockByokService = {
    resolveApiKey: vi.fn().mockResolvedValue(undefined),
  };
  const articleId = testId('article');
  const activityId = testId('activity');

  const mockPublicMetadata = {
    brand: testId('brand'),
    organization: testId('org'),
    user: testId('user'),
  };

  const mockUser = {
    brandId: mockPublicMetadata.brand,
    id: 'user_123',
    organizationId: mockPublicMetadata.organization,
    userId: mockPublicMetadata.user,
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/articles',
    query: {},
  } as Request;

  const mockArticle = {
    id: articleId,
    brand: mockPublicMetadata.brand,
    category: ArticleCategory.POST,
    content: 'This is the article content',
    createdAt: new Date(),
    isDeleted: false,
    label: 'Test Article',
    organization: mockPublicMetadata.organization,
    scope: AssetScope.USER,
    slug: 'test-article',
    status: 'draft',
    summary: 'A test article summary',
    tags: [],
    updatedAt: new Date(),
    user: mockPublicMetadata.user,
  } as unknown as Article;

  const mockArticlesService = {
    findAll: vi.fn(),
    generateArticles: vi.fn(),
    resolveArticleCycleModelConfig: vi.fn(),
    reviewArticle: vi.fn(),
  };

  const mockActivitiesService = {
    record: vi.fn(),
    update: vi.fn(),
  };

  const mockWebsocketService = {
    publishBackgroundTaskUpdate: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    ensureForOrganization: vi.fn(),
  };

  const mockModelsService = {
    findOne: vi.fn(),
  };

  const mockApiKeysService = {
    findOne: vi.fn(),
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockMembersService = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockArticlesService.findAll.mockResolvedValue({ docs: [mockArticle] });
    mockModelsService.findOne.mockResolvedValue(null);
    mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue({
      isGenerateArticlesEnabled: true,
      organizationId: mockPublicMetadata.organization,
    });
    mockMembersService.findOne.mockResolvedValue(null);
    // Permissive by default (org-scoped, matching `BaseService.findOne`'s
    // real org + non-deleted filter): resolves any brandId for this org, so
    // existing tests keep exercising `mockUser.brandId` /
    // `GenerateArticlesDto.brandId` unchanged. The dedicated "brand
    // resolution" tests below override this with stricter stubs.
    mockBrandsService.findOne.mockImplementation(
      async (query: { id?: unknown; organizationId?: unknown }) =>
        query.organizationId === mockPublicMetadata.organization &&
        typeof query.id === 'string'
          ? { id: query.id }
          : null,
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesOperationsController],
      providers: [
        ArticleGenerationCreditsService,
        TextGenerationCreditsService,
        { provide: ByokService, useValue: mockByokService },
        {
          provide: ActivityRecorderService,
          useValue: mockActivitiesService,
        },
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
        {
          provide: ArticlesService,
          useValue: mockArticlesService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: MembersService,
          useValue: mockMembersService,
        },
        {
          provide: ModelsService,
          useValue: mockModelsService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockWebsocketService,
        },
        {
          provide: OrganizationSettingsService,
          useValue: mockOrganizationSettingsService,
        },
      ],
    })
      .overrideGuard(BetterAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CreditsInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();

    controller = module.get<ArticlesOperationsController>(
      ArticlesOperationsController,
    );
    service = module.get<ArticlesService>(ArticlesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateArticles', () => {
    it('should generate articles from prompts', async () => {
      const dto: GenerateArticlesDto = {
        category: ArticleCategory.POST,
        count: 3,
        prompt: 'AI Technology',
      };

      const generatedArticles = [mockArticle, mockArticle, mockArticle];
      mockArticlesService.generateArticles.mockResolvedValue({
        articles: generatedArticles,
        billedCredits: 0,
      });
      mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: 'default-text-model',
        reviewModel: 'default-text-model',
        updateModel: 'default-text-model',
      });
      mockActivitiesService.record.mockResolvedValue({
        id: activityId,
      });
      mockWebsocketService.publishBackgroundTaskUpdate.mockResolvedValue(
        undefined,
      );

      const result = await controller.generateArticles(
        mockRequest,
        dto,
        mockUser,
      );

      expect(service.generateArticles).toHaveBeenCalledWith(
        dto,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
        undefined,
      );
      expect(result).toBeDefined();
    });

    it('uses the requested brandId throughout article generation', async () => {
      const requestedBrandId = testId('brand', 2);
      const dto: GenerateArticlesDto = {
        brandId: requestedBrandId,
        prompt: 'AI Technology',
      };

      mockArticlesService.generateArticles.mockResolvedValue({
        articles: [mockArticle],
        billedCredits: 0,
      });
      mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: 'default-text-model',
        reviewModel: 'default-text-model',
        updateModel: 'default-text-model',
      });
      mockActivitiesService.record.mockResolvedValue({
        id: activityId,
      });
      mockWebsocketService.publishBackgroundTaskUpdate.mockResolvedValue(
        undefined,
      );

      await controller.generateArticles(mockRequest, dto, mockUser);

      expect(service.generateArticles).toHaveBeenCalledWith(
        dto,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        requestedBrandId,
        undefined,
      );
      expect(mockActivitiesService.record).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ brandId: requestedBrandId }),
      );
      expect(mockActivitiesService.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: activityId }),
        expect.objectContaining({
          brandId: requestedBrandId,
          key: ActivityKey.ARTICLE_GENERATED,
          entityId: mockArticle.id,
        }),
      );
    });

    it('resolves the credit pre-flight against the per-request model', async () => {
      const dto: GenerateArticlesDto = {
        model: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
        prompt: 'AI Technology',
      };

      mockModelsService.findOne.mockResolvedValue({
        category: ModelCategory.TEXT,
        cost: 1,
        key: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
      });
      mockArticlesService.generateArticles.mockResolvedValue({
        articles: [mockArticle],
        billedCredits: 0,
      });
      mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
        reviewModel: 'default-text-model',
        updateModel: 'default-text-model',
      });
      mockActivitiesService.record.mockResolvedValue({
        id: activityId,
      });
      mockWebsocketService.publishBackgroundTaskUpdate.mockResolvedValue(
        undefined,
      );

      await controller.generateArticles(mockRequest, dto, mockUser);

      expect(service.resolveArticleCycleModelConfig).toHaveBeenCalledWith(
        mockPublicMetadata.organization,
        MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
      );
      expect(service.generateArticles).toHaveBeenCalledWith(
        dto,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
        undefined,
      );
    });

    it('rejects a generation model that is not a known text model', async () => {
      const dto: GenerateArticlesDto = {
        model: 'not-a-real-model',
        prompt: 'AI Technology',
      };

      mockModelsService.findOne.mockResolvedValue(null);

      await expect(
        controller.generateArticles(mockRequest, dto, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      expect(service.resolveArticleCycleModelConfig).not.toHaveBeenCalled();
      expect(service.generateArticles).not.toHaveBeenCalled();
    });

    it('gates the model against active, non-legacy registry rows only', async () => {
      // Phase C registry policy (#2479): retired (isLegacy) or disabled
      // (isActive: false) keys must not route through even when they exist
      // and are TEXT-category. The registry lookup itself carries the filter,
      // so such rows come back as null and the gate rejects.
      const dto: GenerateArticlesDto = {
        model: MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
        prompt: 'AI Technology',
      };

      mockModelsService.findOne.mockResolvedValue(null);

      await expect(
        controller.generateArticles(mockRequest, dto, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      expect(mockModelsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isDeleted: false,
          isLegacy: false,
        }),
      );
      expect(service.generateArticles).not.toHaveBeenCalled();
    });

    it('rejects a generation model from a non-text category', async () => {
      const dto: GenerateArticlesDto = {
        model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
        prompt: 'AI Technology',
      };

      mockModelsService.findOne.mockResolvedValue({
        category: ModelCategory.IMAGE,
        key: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO,
      });

      await expect(
        controller.generateArticles(mockRequest, dto, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      expect(service.generateArticles).not.toHaveBeenCalled();
    });

    it('fails closed when ensured organization settings keep article generation disabled', async () => {
      const dto: GenerateArticlesDto = {
        prompt: 'AI Technology',
      };
      mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue({
        isGenerateArticlesEnabled: false,
        organizationId: mockPublicMetadata.organization,
      });

      await expect(
        controller.generateArticles(mockRequest, dto, mockUser),
      ).rejects.toMatchObject({
        message: 'Article generation is not enabled for this organization',
        status: HttpStatus.FORBIDDEN,
      });

      expect(
        mockOrganizationSettingsService.ensureForOrganization,
      ).toHaveBeenCalledWith(mockPublicMetadata.organization);
      expect(mockModelsService.findOne).not.toHaveBeenCalled();
      expect(service.resolveArticleCycleModelConfig).not.toHaveBeenCalled();
      expect(service.generateArticles).not.toHaveBeenCalled();
      expect(mockActivitiesService.record).not.toHaveBeenCalled();
    });

    describe('brand resolution (#5292 — no "any brand in this org" fallback for API keys)', () => {
      beforeEach(() => {
        mockArticlesService.generateArticles.mockResolvedValue({
          articles: [mockArticle],
          billedCredits: 0,
        });
        mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
          generationModel: 'default-text-model',
          reviewModel: 'default-text-model',
          updateModel: 'default-text-model',
        });
        mockActivitiesService.record.mockResolvedValue({ id: activityId });
        mockWebsocketService.publishBackgroundTaskUpdate.mockResolvedValue(
          undefined,
        );
      });

      it('resolves an API-key caller\'s brand from the key\'s validated defaultBrandId, never the ambient "any org brand" convenience', async () => {
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
          // Ambient ApiKeyAuthGuard convenience value — must not be trusted
          // as the generation brand for an API-key caller.
          brandId: 'any-org-brand-ambient-fallback',
        } as unknown as User;
        mockApiKeysService.findOne.mockResolvedValue({
          defaultBrandId: 'key-default-brand',
        });
        const dto: GenerateArticlesDto = { prompt: 'AI Technology' };

        await controller.generateArticles(mockRequest, dto, apiKeyUser);

        expect(mockApiKeysService.findOne).toHaveBeenCalledWith({
          id: 'apikey-1',
        });
        expect(service.generateArticles).toHaveBeenCalledWith(
          dto,
          mockPublicMetadata.user,
          mockPublicMetadata.organization,
          'key-default-brand',
          undefined,
        );
      });

      it("falls back to the key owner's member currentBrandId when the key has no valid default brand", async () => {
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
          brandId: 'any-org-brand-ambient-fallback',
        } as unknown as User;
        mockApiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        mockMembersService.findOne.mockResolvedValue({
          currentBrandId: 'owner-current-brand',
        });
        const dto: GenerateArticlesDto = { prompt: 'AI Technology' };

        await controller.generateArticles(mockRequest, dto, apiKeyUser);

        expect(mockMembersService.findOne).toHaveBeenCalledWith({
          organizationId: mockPublicMetadata.organization,
          userId: mockPublicMetadata.user,
        });
        expect(service.generateArticles).toHaveBeenCalledWith(
          dto,
          mockPublicMetadata.user,
          mockPublicMetadata.organization,
          'owner-current-brand',
          undefined,
        );
      });

      it('rejects an API-key caller whose key has no valid default brand and whose owner has no current brand — never widens to "any brand in the org"', async () => {
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
          brandId: 'any-org-brand-ambient-fallback',
        } as unknown as User;
        mockApiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        mockMembersService.findOne.mockResolvedValue(null);
        const dto: GenerateArticlesDto = { prompt: 'AI Technology' };

        await expect(
          controller.generateArticles(mockRequest, dto, apiKeyUser),
        ).rejects.toThrow(
          'brandId is required to generate articles. Configure a default brand for this API key, or pass brandId explicitly.',
        );
        expect(service.generateArticles).not.toHaveBeenCalled();
      });

      it('rejects an API-key caller whose explicit brandId belongs to another organization', async () => {
        const apiKeyUser = {
          ...mockUser,
          apiKeyId: 'apikey-1',
          isApiKey: true,
        } as unknown as User;
        mockApiKeysService.findOne.mockResolvedValue({ defaultBrandId: null });
        mockMembersService.findOne.mockResolvedValue(null);
        // No stub matches 'other-org-brand' for this organization, so the
        // permissive default `mockBrandsService.findOne` still correctly
        // rejects — override it explicitly here to make the intent obvious.
        mockBrandsService.findOne.mockResolvedValue(null);
        const dto: GenerateArticlesDto = {
          brandId: 'other-org-brand',
          prompt: 'AI Technology',
        };

        await expect(
          controller.generateArticles(mockRequest, dto, apiKeyUser),
        ).rejects.toThrow(
          'brandId is required to generate articles. Configure a default brand for this API key, or pass brandId explicitly.',
        );
        expect(service.generateArticles).not.toHaveBeenCalled();
      });

      it('rejects a session/app caller when no brandId resolves at all', async () => {
        const brandlessUser = {
          ...mockUser,
          brandId: undefined,
        } as unknown as User;
        mockMembersService.findOne.mockResolvedValue(null);
        const dto: GenerateArticlesDto = { prompt: 'AI Technology' };

        await expect(
          controller.generateArticles(mockRequest, dto, brandlessUser),
        ).rejects.toThrow('brandId is required to generate articles.');
        expect(service.generateArticles).not.toHaveBeenCalled();
      });
    });
  });

  describe('reviewArticle', () => {
    it('should review an article', async () => {
      const id = articleId;
      const review = { notes: ['tighten the intro'], score: 72 };

      mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: 'default-text-model',
        reviewModel: 'default-text-model',
        updateModel: 'default-text-model',
      });
      mockArticlesService.reviewArticle.mockResolvedValue({
        billedCredits: 0,
        review,
      });

      const result = await controller.reviewArticle(
        mockRequest,
        id,
        { focus: 'clarity' },
        mockUser,
      );

      expect(service.reviewArticle).toHaveBeenCalledWith(
        id,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        'clarity',
        undefined,
      );
      expect(result).toEqual(review);
    });

    it("forwards the org's key to the review workflow and skips the credit floor", async () => {
      mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: 'anthropic/claude-sonnet-5',
        reviewModel: 'anthropic/claude-sonnet-5',
        updateModel: 'anthropic/claude-sonnet-5',
      });
      mockArticlesService.reviewArticle.mockResolvedValue({
        billedCredits: 2,
        review: { score: 80 },
      });
      mockByokService.resolveApiKey.mockResolvedValueOnce({
        apiKey: 'org-or-key',
      });
      const request = {
        creditsConfig: { amount: 0, deferred: true },
      } as unknown as Request & {
        creditsConfig: { isByokBypass?: boolean; amount?: number };
      };

      await controller.reviewArticle(
        request,
        articleId,
        { focus: 'clarity' },
        mockUser,
      );

      expect(service.reviewArticle).toHaveBeenCalledWith(
        articleId,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        'clarity',
        { keys: { [ByokProvider.OPENROUTER]: 'org-or-key' } },
      );
      expect(request.creditsConfig).toMatchObject({
        amount: 2,
        deferred: false,
        isByokBypass: true,
      });
    });
  });
});
