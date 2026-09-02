import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesOperationsController } from '@api/collections/articles/controllers/operations/articles-operations.controller';
import type { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';
import type { Article } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { MODEL_KEYS } from '@genfeedai/constants';
import { ArticleCategory, AssetScope, ModelCategory } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { HttpStatus } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ArticlesOperationsController', () => {
  let controller: ArticlesOperationsController;
  let service: ArticlesService;

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
    create: vi.fn(),
    patch: vi.fn(),
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

  beforeEach(async () => {
    vi.clearAllMocks();
    mockArticlesService.findAll.mockResolvedValue({ docs: [mockArticle] });
    mockModelsService.findOne.mockResolvedValue(null);
    mockOrganizationSettingsService.ensureForOrganization.mockResolvedValue({
      isGenerateArticlesEnabled: true,
      organizationId: mockPublicMetadata.organization,
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesOperationsController],
      providers: [
        {
          provide: ActivitiesService,
          useValue: mockActivitiesService,
        },
        {
          provide: ArticlesService,
          useValue: mockArticlesService,
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
      mockActivitiesService.create.mockResolvedValue({
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
      mockActivitiesService.create.mockResolvedValue({
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
      );
      expect(mockActivitiesService.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ brandId: requestedBrandId }),
      );
      expect(mockActivitiesService.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ brandId: requestedBrandId }),
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
      mockActivitiesService.create.mockResolvedValue({
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

    it('passes no override to model resolution when the request omits one', async () => {
      const dto: GenerateArticlesDto = {
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
      mockActivitiesService.create.mockResolvedValue({
        id: activityId,
      });
      mockWebsocketService.publishBackgroundTaskUpdate.mockResolvedValue(
        undefined,
      );

      await controller.generateArticles(mockRequest, dto, mockUser);

      expect(service.resolveArticleCycleModelConfig).toHaveBeenCalledWith(
        mockPublicMetadata.organization,
        undefined,
      );
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
      expect(mockActivitiesService.create).not.toHaveBeenCalled();
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
      );
      expect(result).toEqual(review);
    });
  });
});
