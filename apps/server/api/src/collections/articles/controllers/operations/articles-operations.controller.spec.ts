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
import { ArticleCategory, AssetScope } from '@genfeedai/enums';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ArticlesOperationsController', () => {
  let controller: ArticlesOperationsController;
  let service: ArticlesService;

  const mockPublicMetadata = {
    brand: '507f1f77bcf86cd799439013',
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  };

  const mockUser = {
    id: 'user_123',
    publicMetadata: mockPublicMetadata,
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
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockArticlesService.findAll.mockResolvedValue({ docs: [mockArticle] });

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
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
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
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
        expect.any(Function),
      );
      expect(result).toBeDefined();
    });
  });

  describe('reviewArticle', () => {
    it('should review an article', async () => {
      const id = '507f1f77bcf86cd799439014';
      const review = { notes: ['tighten the intro'], score: 72 };

      mockArticlesService.resolveArticleCycleModelConfig.mockResolvedValue({
        generationModel: 'default-text-model',
        reviewModel: 'default-text-model',
        updateModel: 'default-text-model',
      });
      mockArticlesService.reviewArticle.mockResolvedValue(review);

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
        expect.any(Function),
      );
      expect(result).toEqual(review);
    });
  });
});
