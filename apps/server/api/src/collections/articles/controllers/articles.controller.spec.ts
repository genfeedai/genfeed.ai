import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import type {
  EditArticleWithAIDto,
  GenerateArticlesDto,
} from '@api/collections/articles/dto/generate-articles.dto';
import type { Article } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { RouterService } from '@api/services/router/router.service';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { ArticleCategory, AssetScope } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ArticlesController', () => {
  let controller: ArticlesController;
  let service: ArticlesService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockRequest = {
    originalUrl: '/api/articles',
    query: {},
  } as Request;

  const mockArticle = {
    id: '507f1f77bcf86cd799439014',
    brand: '507f1f77bcf86cd799439013',
    category: ArticleCategory.POST,
    content: 'This is the article content',
    createdAt: new Date(),
    isDeleted: false,
    label: 'Test Article',
    organization: '507f1f77bcf86cd799439012',
    scope: AssetScope.USER,
    slug: 'test-article',
    status: 'draft',
    summary: 'A test article summary',
    tags: [],
    updatedAt: new Date(),
    user: '507f1f77bcf86cd799439011',
  } as unknown as Article;

  const mockArticlesService = {
    analyzeVirality: vi.fn(),
    convertToTwitterThread: vi.fn(),
    create: vi.fn(),
    enhance: vi.fn(),
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    findOne: vi.fn(),
    generateArticles: vi.fn(),
    getArticleVersions: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    resolveArticleCycleModelConfig: vi.fn(),
    restoreArticleVersion: vi.fn(),
    update: vi.fn(),
  };

  const mockActivitiesService = {
    create: vi.fn(),
    patch: vi.fn(),
  };

  const mockWebsocketService = {
    publishBackgroundTaskUpdate: vi.fn(),
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    findOne: vi.fn(),
  };

  const mockRouterService = {
    getDefaultModel: vi.fn(),
  };

  const mockSeoScorerService = {
    scoreArticle: vi.fn(),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockArticlesService.findAll.mockResolvedValue({ docs: [mockArticle] });
    mockSeoScorerService.scoreArticle.mockResolvedValue({
      score: 84,
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: ArticlesService,
          useValue: mockArticlesService,
        },
        {
          provide: ActivitiesService,
          useValue: mockActivitiesService,
        },
        {
          provide: NotificationsPublisherService,
          useValue: mockWebsocketService,
        },
        {
          provide: BrandsService,
          useValue: mockBrandsService,
        },
        {
          provide: OrganizationSettingsService,
          useValue: mockOrganizationSettingsService,
        },
        {
          provide: RouterService,
          useValue: mockRouterService,
        },
        {
          provide: SeoScorerService,
          useValue: mockSeoScorerService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
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

    controller = module.get<ArticlesController>(ArticlesController);
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
      mockArticlesService.generateArticles.mockResolvedValue(generatedArticles);
      mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: 'default-text-model',
        reviewModel: 'default-text-model',
        updateModel: 'default-text-model',
      });
      mockOrganizationSettingsService.findOne.mockResolvedValue(null);
      mockActivitiesService.create.mockResolvedValue({
        id: '507f191e810c19729de860ee',
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
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
        expect.any(Function),
      );
      expect(result).toBeDefined();
    });
  });

  describe('convertToThread', () => {
    it('should convert article to Twitter thread', async () => {
      const id = '507f1f77bcf86cd799439014';
      const thread = {
        totalTweets: 3,
        tweets: ['Tweet 1', 'Tweet 2', 'Tweet 3'],
      };

      mockArticlesService.convertToTwitterThread.mockResolvedValue(thread);

      const result = await controller.convertToThread(id, mockUser);

      expect(service.convertToTwitterThread).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(result).toEqual(thread);
    });
  });

  describe('analyzeVirality', () => {
    it('should analyze article virality', async () => {
      const id = '507f1f77bcf86cd799439014';
      const analysis = {
        factors: ['engaging title', 'trending topic'],
        score: 85,
        suggestions: ['add more visuals'],
      };

      mockArticlesService.analyzeVirality.mockResolvedValue(analysis);

      const result = await controller.analyzeVirality(id, mockUser);

      expect(service.analyzeVirality).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(result).toEqual(analysis);
    });
  });

  describe('editWithAI', () => {
    it('should edit article with AI', async () => {
      const id = '507f1f77bcf86cd799439014';
      const dto: EditArticleWithAIDto = {
        prompt: 'Make it more engaging',
      };

      const editedArticle = { ...mockArticle, content: 'Updated content' };
      mockArticlesService.enhance.mockResolvedValue(editedArticle);

      const result = await controller.editWithAI(
        mockRequest,
        id,
        dto,
        mockUser,
      );

      expect(service.enhance).toHaveBeenCalledWith(
        id,
        dto,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(result).toBeDefined();
    });
  });

  describe('scoreSeo', () => {
    const id = '507f1f77bcf86cd799439014';

    it('should score article SEO and return the refreshed article', async () => {
      const scoredArticle = {
        ...mockArticle,
        seoBreakdown: { rating: 'good' },
        seoScore: 84,
      };
      mockArticlesService.findAll
        .mockResolvedValueOnce({ docs: [mockArticle] })
        .mockResolvedValueOnce({ docs: [scoredArticle] });

      const result = await controller.scoreSeo(
        mockRequest,
        id,
        { targetKeyword: 'content automation' },
        mockUser,
      );

      expect(service.findAll).toHaveBeenNthCalledWith(
        1,
        {
          where: {
            _id: id,
            isDeleted: false,
          },
        },
        {
          pagination: false,
        },
      );
      expect(mockSeoScorerService.scoreArticle).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.organization,
        'content automation',
      );
      expect(service.findAll).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when article is missing', async () => {
      mockArticlesService.findAll.mockResolvedValueOnce({ docs: [] });

      await expect(
        controller.scoreSeo(mockRequest, id, {}, mockUser),
      ).rejects.toThrow(HttpException);

      expect(mockSeoScorerService.scoreArticle).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when article belongs to another organization', async () => {
      mockArticlesService.findAll.mockResolvedValueOnce({
        docs: [
          {
            ...mockArticle,
            organization: '507f191e810c19729de860ee',
          },
        ],
      });

      await expect(
        controller.scoreSeo(mockRequest, id, {}, mockUser),
      ).rejects.toThrow(HttpException);

      expect(mockSeoScorerService.scoreArticle).not.toHaveBeenCalled();
    });
  });

  describe('getVersions', () => {
    it('should return article versions', async () => {
      const id = '507f1f77bcf86cd799439014';
      const versions = [
        { content: 'Version 1', createdAt: new Date(), promptId: '1' },
        { content: 'Version 2', createdAt: new Date(), promptId: '2' },
      ];

      mockArticlesService.getArticleVersions.mockResolvedValue(versions);

      const result = await controller.getVersions(id, mockUser);

      expect(service.getArticleVersions).toHaveBeenCalledWith(
        id,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(result).toEqual(versions);
    });
  });

  describe('patch (restore from version)', () => {
    it('should restore article version when restoreFromVersionId is set', async () => {
      const id = '507f1f77bcf86cd799439014';
      const promptId = 'prompt123';

      const restoredArticle = { ...mockArticle, content: 'Restored content' };
      mockArticlesService.restoreArticleVersion.mockResolvedValue(
        restoredArticle,
      );

      const result = await controller.patch(mockRequest, mockUser, id, {
        restoreFromVersionId: promptId,
      });

      expect(service.restoreArticleVersion).toHaveBeenCalledWith(
        id,
        promptId,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(service.update).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });
});
