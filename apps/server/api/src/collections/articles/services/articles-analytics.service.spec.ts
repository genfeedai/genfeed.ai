import type { ArticleDocument } from '@api/collections/articles/schemas/article.schema';
import { ArticlesAnalyticsService } from '@api/collections/articles/services/articles-analytics.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Article } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('ArticlesAnalyticsService', () => {
  let service: ArticlesAnalyticsService;
  let logger: LoggerService;
  let configService: ConfigService;

  const mockArticle = {
    _id: 'test-object-id',
    content: 'Test content for analytics',
    isDeleted: false,
    slug: 'test-article',
    title: 'Test Article',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesAnalyticsService,
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue('asst_test123'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            findById: vi.fn(),
            findOne: vi.fn(),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
            deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
            getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              inputTokenPrice: 0.000001,
              key: 'anthropic/claude-sonnet-4',
              minimumCharge: 1,
              outputTokenPrice: 0.000005,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ArticlesAnalyticsService>(ArticlesAnalyticsService);
    logger = module.get<LoggerService>(LoggerService);
    configService = module.get<ConfigService>(ConfigService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('analyzeVirality', () => {
    it('should throw error when Replicate service not available', async () => {
      const serviceWithoutReplicate = new ArticlesAnalyticsService(logger);

      await expect(
        serviceWithoutReplicate.analyzeVirality(
          mockArticle as unknown as ArticleDocument,
        ),
      ).rejects.toThrow('Replicate service not available');
    });

    it('should log analytics operation', async () => {
      await expect(
        service.analyzeVirality(mockArticle as unknown as ArticleDocument),
      ).rejects.toThrow();

      expect(logger.debug).toHaveBeenCalledWith(
        'ArticlesAnalyticsService analyzeVirality',
        expect.objectContaining({
          articleId: mockArticle._id,
        }),
      );
    });
  });

  describe('service initialization', () => {
    it('should initialize with optional dependencies', () => {
      const minimalService = new ArticlesAnalyticsService(logger);
      expect(minimalService).toBeDefined();
    });

    it('should initialize with all dependencies', () => {
      expect(service).toBeDefined();
      expect(logger).toBeDefined();
      expect(configService).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw when replicate service is not configured', async () => {
      await expect(
        service.analyzeVirality(mockArticle as unknown as ArticleDocument),
      ).rejects.toThrow('Replicate service not available');
    });
  });
});
