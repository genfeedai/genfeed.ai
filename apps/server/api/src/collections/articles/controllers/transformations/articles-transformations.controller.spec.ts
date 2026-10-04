import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticlesTransformationsController } from '@api/collections/articles/controllers/transformations/articles-transformations.controller';
import type { Article } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { CREDITS_KEY } from '@api/helpers/decorators/credits/credits.decorator';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokService } from '@api/services/byok/byok.service';
import { TextGenerationCreditsService } from '@api/services/byok/text-generation-credits.service';
import { RouterService } from '@api/services/router/router.service';
import { SeoScorerService } from '@api/services/seo/seo-scorer.service';
import {
  ArticleCategory,
  AssetScope,
  ByokProvider,
} from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ArticlesTransformationsController', () => {
  let controller: ArticlesTransformationsController;
  let service: ArticlesService;

  const articleId = testId('article');
  const otherOrganizationId = testId('org', 2);

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
    brandId: mockPublicMetadata.brand,
    id: articleId,
    category: ArticleCategory.POST,
    content: 'This is the article content',
    createdAt: new Date(),
    isDeleted: false,
    label: 'Test Article',
    organizationId: mockPublicMetadata.organization,
    scope: AssetScope.USER,
    slug: 'test-article',
    status: 'draft',
    summary: 'A test article summary',
    tags: [],
    updatedAt: new Date(),
    userId: mockPublicMetadata.user,
  } as unknown as Article;

  const mockArticlesService = {
    analyzeVirality: vi.fn(),
    convertToTwitterThread: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    generateHeaderPrompt: vi.fn(),
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
        TextGenerationCreditsService,
        { provide: ByokService, useValue: { resolveApiKey: vi.fn() } },
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
      const id = articleId;
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
      const id = articleId;
      const analysis = {
        recommendations: ['Add a hook'],
        score: 85,
      };

      mockArticlesService.analyzeVirality.mockResolvedValue(analysis);

      const result = await controller.analyzeVirality(
        id,
        mockUser,
        mockRequest,
      );

      expect(service.analyzeVirality).toHaveBeenCalledWith(
        id,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
        undefined,
      );
      expect(result).toEqual(analysis);
    });

    // #5375: the resolved BYOK key travels on request.creditsConfig, set by
    // CreditsGuard before the handler runs.
    it('forwards a resolved BYOK key to the service call', async () => {
      const id = articleId;
      mockArticlesService.analyzeVirality.mockResolvedValue({
        recommendations: [],
        score: 1,
      });
      const byokRequest = {
        ...mockRequest,
        creditsConfig: { byokApiKeyOverride: 'org-openrouter-key' },
      } as unknown as Request;

      await controller.analyzeVirality(id, mockUser, byokRequest);

      expect(service.analyzeVirality).toHaveBeenCalledWith(
        id,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
        'org-openrouter-key',
      );
    });
  });

  describe('generatePrompt', () => {
    it('routes header prompt generation through the registered workflow facade', async () => {
      mockArticlesService.generateHeaderPrompt.mockResolvedValue(
        'Editorial header prompt',
      );

      await expect(
        controller.generatePrompt({} as Request, articleId, mockUser),
      ).resolves.toEqual({ prompt: 'Editorial header prompt' });
      expect(mockArticlesService.generateHeaderPrompt).toHaveBeenCalledWith(
        articleId,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        undefined,
      );
    });

    it('opts into the OpenRouter BYOK bypass that its dispatch honours', () => {
      expect(
        Reflect.getMetadata(
          CREDITS_KEY,
          ArticlesTransformationsController.prototype.generatePrompt,
        ),
      ).toMatchObject({
        allowByokBypass: true,
        provider: ByokProvider.OPENROUTER,
      });
    });

    it('hands the guard-resolved key to the workflow as a BYOK dispatch', async () => {
      mockArticlesService.generateHeaderPrompt.mockResolvedValue('Prompt');
      const request = {
        creditsConfig: {
          byokApiKeyOverride: 'org-or-key',
          isByokBypass: true,
          provider: ByokProvider.OPENROUTER,
        },
      } as unknown as Request;

      await controller.generatePrompt(request, articleId, mockUser);

      expect(mockArticlesService.generateHeaderPrompt).toHaveBeenCalledWith(
        articleId,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        { keys: { [ByokProvider.OPENROUTER]: 'org-or-key' } },
      );
    });
  });

  describe('scoreSeo', () => {
    const id = articleId;

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

    it('scopes the article lookup to the caller organization under the CLOUD tenant guard', async () => {
      mockArticlesService.findAll.mockImplementation(
        async (query: { where: Record<string, unknown> }) => {
          assertTenantScopedQuery({
            args: query,
            isCloud: true,
            model: 'Article',
            operation: 'findMany',
            tenantModelNames: new Set(['Article']),
          });
          return {
            docs:
              query.where.organizationId === otherOrganizationId
                ? [mockArticle]
                : [],
          };
        },
      );

      // The row lives in another organization, so the scoped read finds nothing.
      await expect(
        runWithTenantContext(
          { organizationId: mockPublicMetadata.organization },
          () =>
            controller.scoreSeo(
              mockRequest,
              id,
              { targetKeyword: 'ai content' },
              mockUser,
            ),
        ),
      ).rejects.toThrow(HttpException);
      expect(mockArticlesService.findAll).toHaveBeenCalledWith(
        {
          where: {
            id,
            isDeleted: false,
            organizationId: mockPublicMetadata.organization,
          },
        },
        { pagination: false },
      );
      expect(mockSeoScorerService.scoreArticle).not.toHaveBeenCalled();
    });
  });
});
