import { BetterAuthGuard } from '@api/auth/better-auth/guards/better-auth.guard';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import type { Article } from '@api/collections/articles/schemas/article.schema';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ArticleCategory, AssetScope } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('ArticlesController', () => {
  let controller: ArticlesController;
  let service: ArticlesService;

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
    id: testId('article'),
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
    create: vi.fn(),
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    findOne: vi.fn(),
    getArticleVersions: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    restoreArticleVersion: vi.fn(),
    update: vi.fn(),
  };

  // Preview-link minting reads both keys from config; each test sets whatever
  // it needs on top of this default.
  const mockConfigService = {
    get: vi.fn().mockReturnValue(undefined),
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
    mockConfigService.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [
        {
          provide: ArticlesService,
          useValue: mockArticlesService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
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

  describe('findOne', () => {
    it('queries the canonical article id and enforces organization access', async () => {
      const articleId = mockArticle.id;

      await controller.findOne(mockRequest, mockUser, articleId);

      expect(service.findAll).toHaveBeenCalledWith(
        {
          where: {
            id: articleId,
            isDeleted: false,
            organizationId: mockPublicMetadata.organization,
          },
        },
        { pagination: false },
      );
    });
  });

  describe('getVersions', () => {
    it('should return article versions', async () => {
      const id = mockArticle.id;
      const versions = [
        { content: 'Version 1', createdAt: new Date(), promptId: '1' },
        { content: 'Version 2', createdAt: new Date(), promptId: '2' },
      ];

      mockArticlesService.getArticleVersions.mockResolvedValue(versions);

      const result = await controller.getVersions(id, mockUser);

      expect(service.getArticleVersions).toHaveBeenCalledWith(
        id,
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
      );
      expect(result).toEqual(versions);
    });
  });

  describe('patch (restore from version)', () => {
    it('should restore article version when restoreFromVersionId is set', async () => {
      const id = mockArticle.id;
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
        mockPublicMetadata.user,
        mockPublicMetadata.organization,
        mockPublicMetadata.brand,
      );
      expect(service.update).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('createPreviewLink', () => {
    const id = mockArticle.id;

    it('should mint a signed preview URL when a slug, public URL, and signing key exist', async () => {
      mockArticlesService.findOne.mockResolvedValue(mockArticle);
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'GENFEEDAI_PUBLIC_URL'
          ? 'https://genfeed.ai/'
          : 'test-signing-key',
      );

      const result = await controller.createPreviewLink(
        mockRequest,
        mockUser,
        id,
      );

      expect(result.expiresInSeconds).toBeGreaterThan(0);
      expect(result.url).toContain(
        'https://genfeed.ai/articles/test-article?previewToken=',
      );
    });

    it('should reject minting when no signing key is configured', async () => {
      mockArticlesService.findOne.mockResolvedValue(mockArticle);
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'GENFEEDAI_PUBLIC_URL' ? 'https://genfeed.ai' : undefined,
      );

      await expect(
        controller.createPreviewLink(mockRequest, mockUser, id),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
