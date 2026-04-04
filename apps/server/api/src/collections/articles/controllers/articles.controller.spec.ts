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
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { RouterService } from '@api/services/router/router.service';
import type { User } from '@clerk/backend';
import { ArticleCategory, AssetScope } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { Types } from 'mongoose';

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
    _id: '507f1f77bcf86cd799439014',
    brand: new Types.ObjectId('507f1f77bcf86cd799439013'),
    category: ArticleCategory.POST,
    content: 'This is the article content',
    createdAt: new Date(),
    isDeleted: false,
    label: 'Test Article',
    organization: new Types.ObjectId('507f1f77bcf86cd799439012'),
    scope: AssetScope.USER,
    slug: 'test-article',
    status: 'draft',
    summary: 'A test article summary',
    tags: [],
    updatedAt: new Date(),
    user: new Types.ObjectId('507f1f77bcf86cd799439011'),
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

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
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
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    })
      .overrideGuard(ClerkGuard)
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

  describe('findBySlug', () => {
    it('should return an article by slug', async () => {
      const slug = 'test-article';
      mockArticlesService.findBySlug.mockResolvedValue(mockArticle);

      const result = await controller.findBySlug(slug, mockUser);

      expect(service.findBySlug).toHaveBeenCalledWith(
        slug,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(result).toEqual(mockArticle);
    });
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
        _id: new Types.ObjectId(),
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

  describe('restoreVersion', () => {
    it('should restore article version', async () => {
      const id = '507f1f77bcf86cd799439014';
      const promptId = 'prompt123';

      const restoredArticle = { ...mockArticle, content: 'Restored content' };
      mockArticlesService.restoreArticleVersion.mockResolvedValue(
        restoredArticle,
      );

      const result = await controller.restoreVersion(
        mockRequest,
        id,
        promptId,
        mockUser,
      );

      expect(service.restoreArticleVersion).toHaveBeenCalledWith(
        id,
        promptId,
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
      );
      expect(result).toBeDefined();
    });
  });
});
