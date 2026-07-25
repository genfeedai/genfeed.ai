import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticlesTransformationsController } from '@api/collections/articles/controllers/transformations/articles-transformations.controller';
import type { EditArticleWithAIDto } from '@api/collections/articles/dto/generate-articles.dto';
import type { Article } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { RouterService } from '@api/services/router/router.service';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import { ArticleCategory, AssetScope } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ArticlesTransformationsController', () => {
  let controller: ArticlesTransformationsController;
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
    analyzeVirality: vi.fn(),
    convertToTwitterThread: vi.fn(),
    enhance: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesTransformationsController],
      providers: [
        {
          provide: ArticlesService,
          useValue: mockArticlesService,
        },
        {
          provide: BrandsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RouterService,
          useValue: {
            getDefaultModel: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SeoScorerService,
          useValue: mockSeoScorerService,
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

    controller = module.get<ArticlesTransformationsController>(
      ArticlesTransformationsController,
    );
    service = module.get<ArticlesService>(ArticlesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('convertToThread', () => {
    it('should convert an article to a Twitter thread', async () => {
      const id = '507f1f77bcf86cd799439014';
      const thread = ['Tweet 1', 'Tweet 2', 'Tweet 3'];

      mockArticlesService.convertToTwitterThread.mockResolvedValue(thread);

      const result = await controller.convertToThread(id, mockUser);

      expect(service.convertToTwitterThread).toHaveBeenCalledWith(
        id,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
      );
      expect(result).toEqual(thread);
    });
  });

  describe('analyzeVirality', () => {
    it('should analyze article virality', async () => {
      const id = '507f1f77bcf86cd799439014';
      const analysis = {
        recommendations: ['Add a hook'],
        score: 85,
      };

      mockArticlesService.analyzeVirality.mockResolvedValue(analysis);

      const result = await controller.analyzeVirality(id, mockUser);

      expect(service.analyzeVirality).toHaveBeenCalledWith(
        id,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
      );
      expect(result).toEqual(analysis);
    });
  });

  describe('editWithAI', () => {
    it('should enhance an article with AI', async () => {
      const id = '507f1f77bcf86cd799439014';
      const dto: EditArticleWithAIDto = {
        prompt: 'Make it more engaging',
      };

      mockArticlesService.enhance.mockResolvedValue(mockArticle);

      const result = await controller.editWithAI(
        mockRequest,
        id,
        dto,
        mockUser,
      );

      expect(service.enhance).toHaveBeenCalledWith(
        id,
        dto,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
      );
      expect(result).toBeDefined();
    });
  });

  describe('scoreSeo', () => {
    const id = '507f1f77bcf86cd799439014';

    it('should score an article and return the refreshed record', async () => {
      const scoredArticle = { ...mockArticle, seoScore: 91 };
      mockArticlesService.findAll
        .mockResolvedValueOnce({ docs: [mockArticle] })
        .mockResolvedValueOnce({ docs: [scoredArticle] });
      mockSeoScorerService.scoreArticle.mockResolvedValue(undefined);

      const result = await controller.scoreSeo(
        mockRequest,
        id,
        { targetKeyword: 'ai content' },
        mockUser,
      );

      expect(mockSeoScorerService.scoreArticle).toHaveBeenCalledWith(
        id,
        mockPublicMetadata.organization,
        'ai content',
      );
      expect(result).toBeDefined();
    });

    it('should throw NOT_FOUND when the article does not exist', async () => {
      mockArticlesService.findAll.mockResolvedValue({ docs: [] });

      await expect(
        controller.scoreSeo(
          mockRequest,
          id,
          { targetKeyword: 'ai content' },
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
      expect(mockSeoScorerService.scoreArticle).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when the article belongs to another organization', async () => {
      mockArticlesService.findAll.mockResolvedValue({
        docs: [{ ...mockArticle, organization: '507f1f77bcf86cd799439099' }],
      });

      await expect(
        controller.scoreSeo(
          mockRequest,
          id,
          { targetKeyword: 'ai content' },
          mockUser,
        ),
      ).rejects.toThrow(HttpException);
      expect(mockSeoScorerService.scoreArticle).not.toHaveBeenCalled();
    });
  });
});
