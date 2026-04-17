vi.mock('@api/collections/articles/services/article-analytics.service', () => ({
  ArticleAnalyticsService: class {},
}));
vi.mock('@api/collections/templates/services/templates.service', () => ({
  TemplatesService: class {},
}));

vi.mock('@api/collections/articles/services/articles-content.service', () => ({
  ArticlesContentService: class {},
}));

import type { ArticlesQueryDto } from '@api/collections/articles/dto/articles-query.dto';
import { CreateArticleDto } from '@api/collections/articles/dto/create-article.dto';
import type { EditArticleWithAIDto } from '@api/collections/articles/dto/edit-article-with-ai.dto';
import type { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';
import { UpdateArticleDto } from '@api/collections/articles/dto/update-article.dto';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ArticleCategory, ArticleScope, ArticleStatus } from '@genfeedai/enums';
import { type Article } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

// Mock type helper
type MockType<T> = {
  [P in keyof T]?: vi.Mock;
};

describe('ArticlesService', () => {
  let service: ArticlesService;
  let model: ReturnType<typeof createMockModel>;
  let logger: MockType<LoggerService>;
  let _configService: MockType<ConfigService>;
  let cacheService: MockType<CacheService>;
  let replicateService: MockType<ReplicateService>;
  let promptBuilderService: MockType<PromptBuilderService>;
  let notificationsService: MockType<NotificationsService>;
  let _organizationSettingsService: MockType<OrganizationSettingsService>;
  let promptsService: MockType<PromptsService>;
  let articlesContentService: MockType<ArticlesContentService>;
  let _templatesService: MockType<TemplatesService>;
  let articleAnalyticsService: MockType<ArticleAnalyticsService>;
  let creditsUtilsService: MockType<CreditsUtilsService>;
  let modelsService: MockType<ModelsService>;

  // Test data
  const mockUserId = 'test-object-id';
  const mockOrgId = 'test-object-id';
  const mockBrandId = 'test-object-id';
  const mockArticleId = 'test-object-id';

  const mockArticle = {
    _id: mockArticleId,
    brand: mockBrandId,
    category: ArticleCategory.POST,
    content: '# Test Article\n\nThis is test content.',
    createdAt: new Date(),
    isDeleted: false,
    label: 'Test Article',
    organization: { _id: mockOrgId, label: 'Test Org' },
    populate: vi.fn().mockReturnThis(),
    save: vi.fn().mockResolvedValue(this),
    scope: ArticleScope.USER,
    slug: 'test-article',
    status: ArticleStatus.DRAFT,
    summary: 'A test article summary',
    tags: [],
    updatedAt: new Date(),
    user: { _id: mockUserId, firstName: 'Test', lastName: 'User' },
  };

  beforeEach(async () => {
    // Create mock factories
    const mockModelFactory = () => {
      const mockModel: any = vi.fn().mockImplementation(function (
        this: unknown,
        createDto: Record<string, unknown>,
      ) {
        return {
          ...createDto,
          save: vi.fn().mockResolvedValue({
            ...mockArticle,
            ...createDto,
          }),
        };
      });

      mockModel.aggregate = vi.fn().mockReturnThis();
      mockModel.aggregatePaginate = vi.fn().mockResolvedValue({
        docs: [],
        limit: 10,
        page: 1,
        totalDocs: 0,
        totalPages: 0,
      });
      mockModel.countDocuments = vi.fn().mockResolvedValue(0);
      mockModel.create = vi.fn();
      mockModel.deleteOne = vi.fn();
      mockModel.exec = vi.fn().mockResolvedValue(null);
      mockModel.find = vi.fn().mockReturnThis();
      mockModel.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });
      mockModel.findByIdAndUpdate = vi.fn().mockReturnThis();
      mockModel.findOne = vi.fn().mockReturnThis();
      mockModel.findOneAndUpdate = vi.fn().mockReturnThis();
      mockModel.lean = vi.fn().mockReturnThis();
      mockModel.limit = vi.fn().mockReturnThis();
      mockModel.populate = vi.fn().mockReturnThis();
      mockModel.skip = vi.fn().mockReturnThis();
      mockModel.sort = vi.fn().mockReturnThis();
      mockModel.updateOne = vi.fn();

      // Add collection and modelName properties for BaseService
      mockModel.collection = { name: 'articles' };
      mockModel.modelName = 'Article';

      return mockModel;
    };

    const mockLoggerFactory = () => ({
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    });

    const mockConfigServiceFactory = () => ({
      get: vi.fn((key: string) => {
        const config: Record<string, string> = {
          GENFEEDAI_PUBLIC_URL: 'https://genfeed.ai',
          MAX_TOKENS: '4096',
        };
        return config[key];
      }),
    });

    const mockCacheServiceFactory = () => ({
      exists: vi.fn().mockResolvedValue(false),
      generateKey: vi.fn((...args: string[]) => args.join(':')),
      get: vi.fn().mockResolvedValue(null),
      invalidateByTags: vi.fn().mockResolvedValue(5),
      set: vi.fn().mockResolvedValue(true),
    });

    const mockReplicateServiceFactory = () => ({
      generateTextCompletionSync: vi.fn().mockResolvedValue('Mock AI response'),
      runModel: vi.fn().mockResolvedValue('mock_prediction_id'),
    });

    const mockPromptBuilderServiceFactory = () => ({
      buildPrompt: vi.fn().mockResolvedValue({
        input: { prompt: 'Mock prompt', system_prompt: 'Mock system' },
      }),
    });

    const mockNotificationsServiceFactory = () => ({
      sendArticleNotification: vi.fn().mockResolvedValue(undefined),
    });

    const mockOrganizationSettingsServiceFactory = () => ({
      findOne: vi.fn().mockResolvedValue({
        isNotificationsDiscordEnabled: true,
      }),
    });

    const mockPromptsServiceFactory = () => ({
      findAll: vi.fn().mockResolvedValue({ docs: [] }),
      findOne: vi.fn().mockResolvedValue(null),
    });

    const mockArticlesContentServiceFactory = () => ({
      convertToTwitterThread: vi.fn().mockResolvedValue({
        totalTweets: 2,
        tweets: ['Tweet 1', 'Tweet 2'],
      }),
      enhance: vi.fn().mockResolvedValue(mockArticle),
      generateArticles: vi.fn().mockResolvedValue([mockArticle]),
    });

    const mockTemplatesServiceFactory = () => ({
      getRenderedPrompt: vi.fn().mockResolvedValue('Rendered prompt template'),
    });

    const mockArticleAnalyticsServiceFactory = () => ({
      updatePerformanceMetrics: vi.fn().mockResolvedValue(undefined),
    });

    const mockCreditsUtilsServiceFactory = () => ({
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    });

    const mockModelsServiceFactory = () => ({
      findOne: vi.fn().mockResolvedValue({
        inputTokenPrice: 0.000001,
        key: 'anthropic/claude-sonnet-4',
        minimumCharge: 1,
        outputTokenPrice: 0.000005,
      }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesService,
        {
          provide: PrismaService,
          useFactory: mockModelFactory,
        },
        {
          provide: LoggerService,
          useFactory: mockLoggerFactory,
        },
        {
          provide: ConfigService,
          useFactory: mockConfigServiceFactory,
        },
        {
          provide: CacheService,
          useFactory: mockCacheServiceFactory,
        },
        {
          provide: ReplicateService,
          useFactory: mockReplicateServiceFactory,
        },
        {
          provide: PromptBuilderService,
          useFactory: mockPromptBuilderServiceFactory,
        },
        {
          provide: NotificationsService,
          useFactory: mockNotificationsServiceFactory,
        },
        {
          provide: OrganizationSettingsService,
          useFactory: mockOrganizationSettingsServiceFactory,
        },
        {
          provide: PromptsService,
          useFactory: mockPromptsServiceFactory,
        },
        {
          provide: ArticlesContentService,
          useFactory: mockArticlesContentServiceFactory,
        },
        {
          provide: TemplatesService,
          useFactory: mockTemplatesServiceFactory,
        },
        {
          provide: ArticleAnalyticsService,
          useFactory: mockArticleAnalyticsServiceFactory,
        },
        {
          provide: CreditsUtilsService,
          useFactory: mockCreditsUtilsServiceFactory,
        },
        {
          provide: ModelsService,
          useFactory: mockModelsServiceFactory,
        },
      ],
    }).compile();

    service = module.get<ArticlesService>(ArticlesService);
    model = module.get(PrismaService);
    logger = module.get(LoggerService);
    _configService = module.get(ConfigService);
    cacheService = module.get(CacheService);
    replicateService = module.get(ReplicateService);
    promptBuilderService = module.get(PromptBuilderService);
    notificationsService = module.get(NotificationsService);
    _organizationSettingsService = module.get(OrganizationSettingsService);
    promptsService = module.get(PromptsService);
    articlesContentService = module.get(ArticlesContentService);
    _templatesService = module.get(TemplatesService);
    articleAnalyticsService = module.get(ArticleAnalyticsService);
    creditsUtilsService = module.get(CreditsUtilsService);
    modelsService = module.get(ModelsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('createArticle', () => {
    const createDto: Partial<CreateArticleDto> = {
      category: ArticleCategory.POST,
      content: 'Article content',
      label: 'New Article',
      status: ArticleStatus.DRAFT,
      summary: 'Article summary',
    };

    it('should create an article with valid parameters', async () => {
      const createdArticle = { ...mockArticle, ...createDto };
      // BaseService.create() uses `new this.model(dto)` constructor, not model.create()
      (model as vi.Mock).mockImplementationOnce(function () {
        return {
          ...createdArticle,
          save: vi.fn().mockResolvedValue(createdArticle),
        };
      });

      // findById is called after save when populate is provided (getPopulationForContext returns non-empty)
      model.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(createdArticle),
        populate: vi.fn().mockReturnThis(),
      });

      await service.createArticle(
        createDto as CreateArticleDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(logger.debug).toHaveBeenCalled();
      expect(cacheService.invalidateByTags).toHaveBeenCalled();
    });

    it('should throw error for invalid userId', async () => {
      await expect(
        service.createArticle(
          createDto as CreateArticleDto,
          'invalid-id',
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid userId');
    });

    it('should throw error for invalid organizationId', async () => {
      await expect(
        service.createArticle(
          createDto as CreateArticleDto,
          mockUserId.toString(),
          'invalid-org-id',
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid organizationId');
    });

    it('should throw error for invalid brandId', async () => {
      await expect(
        service.createArticle(
          createDto as CreateArticleDto,
          mockUserId.toString(),
          mockOrgId.toString(),
          'invalid-brand-id',
        ),
      ).rejects.toThrow('Invalid brandId');
    });

    it('should invalidate cache after creation', async () => {
      const createdArticle = { ...mockArticle, ...createDto };
      (model as vi.Mock).mockImplementationOnce(function () {
        return {
          ...createdArticle,
          save: vi.fn().mockResolvedValue(createdArticle),
        };
      });
      model.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(createdArticle),
        populate: vi.fn().mockReturnThis(),
      });

      await service.createArticle(
        createDto as CreateArticleDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(cacheService.invalidateByTags).toHaveBeenCalledWith(
        expect.arrayContaining(['articles', 'agg:paginated']),
      );
    });
  });

  describe('findOneArticle', () => {
    it('should find an article by id', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findOneArticle(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result).toBeDefined();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.findOneArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error for invalid userId', async () => {
      await expect(
        service.findOneArticle(
          mockArticleId.toString(),
          'invalid',
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid userId');
    });

    it('should throw error for invalid organizationId', async () => {
      await expect(
        service.findOneArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          'invalid',
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid organizationId');
    });

    it('should throw error for invalid brandId', async () => {
      await expect(
        service.findOneArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          'invalid',
        ),
      ).rejects.toThrow('Invalid brandId');
    });
  });

  describe('findBySlug', () => {
    it('should find an article by slug', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findBySlug(
        'test-article',
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result).toBeDefined();
      expect(result.slug).toBe('test-article');
    });

    it('should throw NotFoundException when article not found by slug', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.findBySlug(
          'non-existent-slug',
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const updateDto: Partial<UpdateArticleDto> = {
      content: 'Updated content',
      label: 'Updated Article',
    };

    it('should update an article', async () => {
      const updatedArticle = {
        ...mockArticle,
        ...updateDto,
        organization: { _id: mockOrgId },
        user: { _id: mockUserId },
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedArticle),
        populate: vi.fn().mockReturnThis(),
      });

      await service.update(
        mockArticleId.toString(),
        updateDto as UpdateArticleDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(logger.debug).toHaveBeenCalled();
    });

    it('should set publishedAt when publishing article', async () => {
      const publishDto: Partial<UpdateArticleDto> = {
        status: ArticleStatus.PUBLIC,
      };

      const publishedArticle = {
        ...mockArticle,
        organization: { _id: mockOrgId },
        publishedAt: new Date(),
        scope: ArticleScope.PUBLIC,
        slug: 'test-article',
        status: ArticleStatus.PUBLIC,
        user: { _id: mockUserId },
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(publishedArticle),
        populate: vi.fn().mockReturnThis(),
      });

      await service.update(
        mockArticleId.toString(),
        publishDto as UpdateArticleDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(notificationsService.sendArticleNotification).toHaveBeenCalled();
    });

    it('should invalidate cache after update', async () => {
      const updatedArticle = {
        ...mockArticle,
        ...updateDto,
        organization: { _id: mockOrgId },
        user: { _id: mockUserId },
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedArticle),
        populate: vi.fn().mockReturnThis(),
      });

      await service.update(
        mockArticleId.toString(),
        updateDto as UpdateArticleDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(cacheService.invalidateByTags).toHaveBeenCalled();
    });

    it('should throw error for invalid userId', async () => {
      await expect(
        service.update(
          mockArticleId.toString(),
          updateDto as UpdateArticleDto,
          'invalid',
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid userId');
    });

    it('should throw error for invalid organizationId', async () => {
      await expect(
        service.update(
          mockArticleId.toString(),
          updateDto as UpdateArticleDto,
          mockUserId.toString(),
          'invalid',
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid organizationId');
    });

    it('should throw error for invalid brandId', async () => {
      await expect(
        service.update(
          mockArticleId.toString(),
          updateDto as UpdateArticleDto,
          mockUserId.toString(),
          mockOrgId.toString(),
          'invalid',
        ),
      ).rejects.toThrow('Invalid brandId');
    });
  });

  describe('removeArticle', () => {
    it('should soft delete an article', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ ...mockArticle, isDeleted: true }),
        populate: vi.fn().mockReturnThis(),
      });

      await service.removeArticle(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('remove success'),
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.removeArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate cache after deletion', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ ...mockArticle, isDeleted: true }),
        populate: vi.fn().mockReturnThis(),
      });

      await service.removeArticle(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(cacheService.invalidateByTags).toHaveBeenCalled();
    });

    it('should throw error for invalid userId', async () => {
      await expect(
        service.removeArticle(
          mockArticleId.toString(),
          'invalid',
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid userId');
    });

    it('should throw error for invalid organizationId', async () => {
      await expect(
        service.removeArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          'invalid',
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid organizationId');
    });

    it('should throw error for invalid brandId', async () => {
      await expect(
        service.removeArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          'invalid',
        ),
      ).rejects.toThrow('Invalid brandId');
    });
  });

  describe('findPublicArticles', () => {
    // Helper to create valid query DTO with defaults
    const createQueryDto = (overrides: Record<string, any> = {}) => ({
      isDeleted: false,
      limit: 10,
      page: 1,
      pagination: true,
      sort: 'createdAt: -1',
      ...overrides,
    });

    it('should find public articles with pagination', async () => {
      const publicArticles = [{ ...mockArticle, status: ArticleStatus.PUBLIC }];

      model.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue(publicArticles),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });
      model.countDocuments.mockResolvedValue(1);

      const result = await service.findPublicArticles(
        createQueryDto() as unknown as ArticlesQueryDto,
      );

      expect(result.articles).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('should filter by search term', async () => {
      model.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });
      model.countDocuments.mockResolvedValue(0);

      await service.findPublicArticles(
        createQueryDto({ search: 'test query' }) as unknown as ArticlesQueryDto,
      );

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: expect.any(Array),
        }),
      );
    });

    it('should filter by category', async () => {
      model.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });
      model.countDocuments.mockResolvedValue(0);

      await service.findPublicArticles(
        createQueryDto({
          category: ArticleCategory.POST,
        }) as unknown as ArticlesQueryDto,
      );

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ArticleCategory.POST,
        }),
      );
    });

    it('should filter by tag', async () => {
      const tagId = 'test-object-id';
      model.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });
      model.countDocuments.mockResolvedValue(0);

      await service.findPublicArticles(
        createQueryDto({
          tag: tagId.toString(),
        }) as unknown as ArticlesQueryDto,
      );

      expect(model.find).toHaveBeenCalled();
    });

    it('should use default pagination values', async () => {
      model.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });
      model.countDocuments.mockResolvedValue(0);

      const result = await service.findPublicArticles(
        createQueryDto() as unknown as ArticlesQueryDto,
      );

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should support custom sorting', async () => {
      model.find.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
      });
      model.countDocuments.mockResolvedValue(0);

      await service.findPublicArticles(
        createQueryDto({
          sortBy: 'label',
          sortOrder: 'asc',
        }) as unknown as ArticlesQueryDto,
      );

      expect(model.find().sort).toHaveBeenCalled();
    });
  });

  describe('findPublicArticleBySlug', () => {
    it('should find public article by slug', async () => {
      const publicArticle = {
        ...mockArticle,
        populate: vi.fn().mockResolvedValue(mockArticle),
        status: ArticleStatus.PUBLIC,
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(publicArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findPublicArticleBySlug('test-article');

      expect(result).toBeDefined();
    });

    it('should return null when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findPublicArticleBySlug('non-existent');

      expect(result).toBeNull();
    });

    it('should allow any status in preview mode', async () => {
      const draftArticle = {
        ...mockArticle,
        populate: vi.fn().mockResolvedValue(mockArticle),
        status: ArticleStatus.DRAFT,
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(draftArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findPublicArticleBySlug(
        'test-article',
        true,
      );

      expect(result).toBeDefined();
    });

    it('should handle article with valid banner ObjectId', async () => {
      const articleWithBanner = {
        ...mockArticle,
        banner: 'test-object-id',
        populate: vi.fn().mockResolvedValue(mockArticle),
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(articleWithBanner),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findPublicArticleBySlug('test-article');

      expect(result).toBeDefined();
    });

    it('should handle article with empty banner string', async () => {
      const articleWithEmptyBanner = {
        ...mockArticle,
        banner: '',
        populate: vi.fn().mockResolvedValue(mockArticle),
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(articleWithEmptyBanner),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findPublicArticleBySlug('test-article');

      expect(result).toBeDefined();
      expect(result?.banner).toBeNull();
    });
  });

  describe('generateArticles', () => {
    it('should delegate to ArticlesContentService', async () => {
      const generateDto = {
        count: 1,
        topic: 'AI Technology',
      };

      await service.generateArticles(
        generateDto as unknown as GenerateArticlesDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(articlesContentService.generateArticles).toHaveBeenCalledWith(
        generateDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
        {
          generationModel: expect.any(String),
          reviewModel: expect.any(String),
          updateModel: expect.any(String),
        },
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('should invalidate cache after generation', async () => {
      const generateDto = {
        count: 1,
        topic: 'AI Technology',
      };

      await service.generateArticles(
        generateDto as unknown as GenerateArticlesDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(cacheService.invalidateByTags).toHaveBeenCalled();
    });
  });

  describe('enhance', () => {
    it('should enhance article with AI using edit template', async () => {
      const editDto = {
        enhanceType: 'edit',
        instructions: 'Make it more engaging',
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      await service.enhance(
        mockArticleId.toString(),
        editDto as unknown as EditArticleWithAIDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(articlesContentService.enhance).toHaveBeenCalled();
    });

    it('should use SEO template when enhanceType is seo', async () => {
      const editDto = {
        enhanceType: 'seo',
        instructions: 'Optimize for SEO',
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      await service.enhance(
        mockArticleId.toString(),
        editDto as unknown as EditArticleWithAIDto,
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(articlesContentService.enhance).toHaveBeenCalled();
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.enhance(
          mockArticleId.toString(),
          { instructions: 'test' } as unknown as EditArticleWithAIDto,
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getArticleVersions', () => {
    it('should return article versions from prompts', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findAll?.mockResolvedValue({
        docs: [
          {
            _id: 'test-object-id',
            enhanced: '{"title": "Test", "content": "Content"}',
            original: 'Original prompt',
          },
        ],
      });

      const result = await service.getArticleVersions(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result.articleId).toBeDefined();
      expect(result.prompts).toHaveLength(1);
      expect(result.totalVersions).toBe(1);
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.getArticleVersions(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty array when no prompts exist', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findAll?.mockResolvedValue({ docs: [] });

      const result = await service.getArticleVersions(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result.prompts).toHaveLength(0);
      expect(result.totalVersions).toBe(0);
    });
  });

  describe('restoreArticleVersion', () => {
    it('should restore article to specific version', async () => {
      const promptId = 'test-object-id';
      const versionData = {
        content: 'Restored Content',
        summary: 'Restored Summary',
        title: 'Restored Title',
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findOne?.mockResolvedValue({
        _id: promptId,
        enhanced: JSON.stringify(versionData),
      });

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ ...mockArticle, ...versionData }),
        populate: vi.fn().mockReturnThis(),
      });

      await service.restoreArticleVersion(
        mockArticleId.toString(),
        promptId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('restored article'),
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.restoreArticleVersion(
          mockArticleId.toString(),
          'test-object-id'.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when prompt not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findOne?.mockResolvedValue(null);

      await expect(
        service.restoreArticleVersion(
          mockArticleId.toString(),
          'test-object-id'.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error for corrupted version data', async () => {
      const promptId = 'test-object-id';

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findOne?.mockResolvedValue({
        _id: promptId,
        enhanced: 'invalid json',
      });

      await expect(
        service.restoreArticleVersion(
          mockArticleId.toString(),
          promptId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Version data is corrupted');
    });
  });

  describe('convertToTwitterThread', () => {
    it('should convert article to Twitter thread', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.convertToTwitterThread(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result.tweets).toBeDefined();
      expect(
        articlesContentService.convertToTwitterThread,
      ).toHaveBeenCalledWith(mockArticle);
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.convertToTwitterThread(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('analyzeVirality', () => {
    const validViralityResponse = {
      factors: {
        emotionalAppeal: 80,
        readability: 85,
        seoScore: 60,
        shareability: 70,
        trendAlignment: 75,
      },
      predictions: {
        estimatedEngagement: 0.05,
        estimatedReach: 10000,
        estimatedShares: 500,
      },
      suggestions: ['Add more visuals', 'Include statistics'],
      viralityScore: 75,
    };

    it('should analyze article virality', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      replicateService.generateTextCompletionSync?.mockResolvedValue(
        JSON.stringify(validViralityResponse),
      );

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.analyzeVirality(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result.analysis.score).toBe(75);
      expect(result.analysis.factors).toBeDefined();
      expect(result.analysis.predictions).toBeDefined();
      expect(result.analysis.suggestions).toHaveLength(2);
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.analyzeVirality(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error for invalid JSON response', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      replicateService.generateTextCompletionSync?.mockResolvedValue(
        'Invalid JSON response',
      );

      await expect(
        service.analyzeVirality(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid JSON response from AI service');
    });

    it('should throw error for incomplete response format', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      replicateService.generateTextCompletionSync?.mockResolvedValue(
        JSON.stringify({ viralityScore: 50 }), // Missing required fields
      );

      await expect(
        service.analyzeVirality(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Invalid response format from AI service');
    });
  });

  describe('updatePerformanceMetrics', () => {
    it('should update performance metrics via analytics service', async () => {
      const metrics = {
        clickThroughRate: 0.05,
        comments: 5,
        likes: 50,
        shares: 10,
        views: 100,
      };

      await service.updatePerformanceMetrics(mockArticleId.toString(), metrics);

      expect(
        articleAnalyticsService.updatePerformanceMetrics,
      ).toHaveBeenCalledWith(mockArticleId.toString(), metrics);
    });

    it('should handle partial metrics', async () => {
      const metrics = {
        views: 100,
      };

      await service.updatePerformanceMetrics(mockArticleId.toString(), metrics);

      expect(
        articleAnalyticsService.updatePerformanceMetrics,
      ).toHaveBeenCalledWith(mockArticleId.toString(), metrics);
    });
  });

  describe('generatePromptFromArticle', () => {
    it('should generate prompt from article content', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      replicateService.generateTextCompletionSync?.mockResolvedValue(
        'A beautiful sunset over mountains with vibrant colors',
      );

      model.findByIdAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.generatePromptFromArticle(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result).toBe(
        'A beautiful sunset over mountains with vibrant colors',
      );
      expect(promptBuilderService.buildPrompt).toHaveBeenCalled();
    });

    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.generatePromptFromArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle empty AI response', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      replicateService.generateTextCompletionSync?.mockResolvedValue(null);

      await expect(
        service.generatePromptFromArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Failed to generate prompt from AI service');
    });
  });

  describe('createRemix', () => {
    it('should create a remix of an existing article', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.create.mockResolvedValue({
        ...mockArticle,
        label: 'Remix: Test Article',
      });

      await service.createRemix(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('creating remix'),
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when original article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.createRemix(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should allow custom label for remix', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.create.mockResolvedValue({
        ...mockArticle,
        label: 'Custom Remix Title',
      });

      await service.createRemix(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
        { label: 'Custom Remix Title' },
      );

      expect(logger.log).toHaveBeenCalled();
    });

    it('should generate unique slug for remix', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      model.create.mockResolvedValue({
        ...mockArticle,
        slug: 'test-article-remix-123456789',
      });

      await service.createRemix(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('remix created'),
        expect.any(Object),
      );
    });

    it('should handle article with null slug', async () => {
      const articleWithNullSlug = { ...mockArticle, slug: null };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(articleWithNullSlug),
        populate: vi.fn().mockReturnThis(),
      });

      model.create.mockResolvedValue({
        ...mockArticle,
        slug: 'article-remix-123456789',
      });

      await service.createRemix(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(logger.log).toHaveBeenCalled();
    });
  });

  describe('getPopulationForContext', () => {
    it('should return list population for list context', () => {
      const serviceAny = service as any;
      const result = serviceAny.getPopulationForContext('list');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return detail population for detail context', () => {
      const serviceAny = service as any;
      const result = serviceAny.getPopulationForContext('detail');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return minimal population for minimal context', () => {
      const serviceAny = service as any;
      const result = serviceAny.getPopulationForContext('minimal');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return create population for create context', () => {
      const serviceAny = service as any;
      const result = serviceAny.getPopulationForContext('create');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should default to minimal population when context not specified', () => {
      const serviceAny = service as any;
      const result = serviceAny.getPopulationForContext();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('generateFromTranscript', () => {
    it('should throw NotFoundException when transcript not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ data: null }),
      } as any);

      await expect(
        service.generateFromTranscript(
          'transcript-1',
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Transcript transcript-1 not found');
    });

    it('should handle transcript without transcriptText gracefully', async () => {
      // When transcriptText is missing, the service uses an empty string for summary
      // and proceeds to generate the article — it does not throw.
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({
            data: {
              videoTitle: 'Test Video',
            },
          }),
        } as any)
        .mockResolvedValueOnce({
          json: vi.fn().mockResolvedValue({}),
        } as any);

      model.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.generateFromTranscript(
        'transcript-1',
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result).toBeDefined();
    });
  });

  describe('updatePerformanceMetrics', () => {
    it('should update metrics via article analytics service', async () => {
      articleAnalyticsService.updatePerformanceMetrics = vi
        .fn()
        .mockResolvedValue({});

      await service.updatePerformanceMetrics(mockArticleId.toString(), {
        likes: 50,
        shares: 10,
        views: 100,
      });

      expect(
        articleAnalyticsService.updatePerformanceMetrics,
      ).toHaveBeenCalledWith(mockArticleId.toString(), {
        likes: 50,
        shares: 10,
        views: 100,
      });
    });

    it('should log warning when analytics service not available', async () => {
      const serviceWithoutAnalytics = new ArticlesService(
        model,
        logger as any,
        {} as any,
      );

      await serviceWithoutAnalytics.updatePerformanceMetrics(
        mockArticleId.toString(),
        { views: 100 },
      );

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('createRemix', () => {
    it('should create a remix with unique slug', async () => {
      const originalArticle = {
        ...mockArticle,
        slug: 'original-article',
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(originalArticle),
        populate: vi.fn().mockReturnThis(),
      });

      vi.spyOn(service, 'createArticle').mockResolvedValue(mockArticle as any);

      await service.createRemix(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(service.createArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: expect.stringContaining('original-article-remix-'),
        }),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );
    });

    it('should create remix with custom label', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      vi.spyOn(service, 'createArticle').mockResolvedValue(mockArticle as any);

      await service.createRemix(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
        { label: 'Custom Remix Title' },
      );

      expect(service.createArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Custom Remix Title',
        }),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );
    });

    it('should throw NotFoundException when original article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.createRemix(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Original article');
    });
  });

  describe('findPublicArticleBySlug', () => {
    it('should return null for non-public article when not in preview mode', async () => {
      const draftArticle = {
        ...mockArticle,
        status: ArticleStatus.DRAFT,
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findPublicArticleBySlug('test-slug', false);

      expect(result).toBeNull();
    });

    it('should handle invalid banner ObjectId gracefully', async () => {
      const articleWithInvalidBanner = {
        ...mockArticle,
        banner: '',
        populate: vi.fn().mockReturnThis(),
        toObject: vi.fn().mockReturnValue({
          ...mockArticle,
          banner: '',
        }),
      };

      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(articleWithInvalidBanner),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.findPublicArticleBySlug('test-slug', true);

      expect(result).toBeDefined();
    });
  });

  describe('getArticleVersions', () => {
    it('should throw NotFoundException when article not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.getArticleVersions(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Article not found');
    });

    it('should return empty versions when prompts service not available', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      const serviceWithoutPrompts = new ArticlesService(
        model,
        logger as any,
        {} as any,
      );

      const result = await serviceWithoutPrompts.getArticleVersions(
        mockArticleId.toString(),
        mockUserId.toString(),
        mockOrgId.toString(),
        mockBrandId.toString(),
      );

      expect(result.totalVersions).toBe(0);
      expect(result.prompts).toEqual([]);
    });
  });

  describe('restoreArticleVersion', () => {
    it('should throw when version data is missing', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findOne = vi.fn().mockResolvedValue({
        _id: 'prompt-1',
        enhanced: null,
      });

      await expect(
        service.restoreArticleVersion(
          mockArticleId.toString(),
          'prompt-1',
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Version data is missing');
    });

    it('should throw when version data is invalid JSON', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findOne = vi.fn().mockResolvedValue({
        _id: 'prompt-1',
        enhanced: 'invalid json',
      });

      await expect(
        service.restoreArticleVersion(
          mockArticleId.toString(),
          'prompt-1',
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Version data is corrupted');
    });

    it('should throw NotFoundException when prompt not found', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockArticle),
        populate: vi.fn().mockReturnThis(),
      });

      promptsService.findOne = vi.fn().mockResolvedValue(null);

      await expect(
        service.restoreArticleVersion(
          mockArticleId.toString(),
          'prompt-1',
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow('Version not found');
    });
  });

  describe('error handling', () => {
    it('should log errors on update failure', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Database error')),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.update(
          mockArticleId.toString(),
          { label: 'test' } as UpdateArticleDto,
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });

    it('should log errors on remove failure', async () => {
      model.findOne.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('Database error')),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.removeArticle(
          mockArticleId.toString(),
          mockUserId.toString(),
          mockOrgId.toString(),
          mockBrandId.toString(),
        ),
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
