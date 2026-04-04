import type { GenerateArticlesDto } from '@api/collections/articles/dto/generate-articles.dto';
import { Article } from '@api/collections/articles/schemas/article.schema';
import { ArticlesContentService } from '@api/collections/articles/services/articles-content.service';
import { Prompt } from '@api/collections/prompts/schemas/prompt.schema';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigService } from '@api/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('ArticlesContentService', () => {
  let service: ArticlesContentService;
  let logger: LoggerService;
  let configService: ConfigService;

  const _mockArticle = {
    _id: new Types.ObjectId(),
    content: 'Test content',
    isDeleted: false,
    slug: 'test-article',
    title: 'Test Article',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesContentService,
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
          provide: getModelToken(Prompt.name),
          useValue: {
            create: vi.fn(),
            findById: vi.fn(),
            findByIdAndUpdate: vi.fn(),
          },
        },
        {
          provide: getModelToken(Article.name),
          useValue: {
            create: vi.fn(),
            findById: vi.fn(),
            findByIdAndUpdate: vi.fn(),
          },
        },
        {
          provide: TemplatesService,
          useValue: {
            getRenderedPrompt: vi.fn(),
            updateMetadata: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ArticlesContentService>(ArticlesContentService);
    logger = module.get<LoggerService>(LoggerService);
    configService = module.get<ConfigService>(ConfigService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateArticles', () => {
    it('should throw error when OpenAI service not available', async () => {
      const serviceWithoutOpenAI = new ArticlesContentService(
        logger,
        configService,
      );
      const mockCreateFn = vi.fn();

      await expect(
        serviceWithoutOpenAI.generateArticles(
          {} as unknown as GenerateArticlesDto,
          'userId',
          'orgId',
          'brandId',
          { generationModel: 'gpt-4o' },
          mockCreateFn,
        ),
      ).rejects.toThrow('OpenAI service not available');
    });

    it('should log generation attempt', async () => {
      const mockCreateFn = vi.fn();

      await expect(
        service.generateArticles(
          { prompt: 'test' } as unknown as GenerateArticlesDto,
          'userId',
          'orgId',
          'brandId',
          { generationModel: 'gpt-4o' },
          mockCreateFn,
        ),
      ).rejects.toThrow();

      expect(logger.debug).toHaveBeenCalledWith(
        'ArticlesContentService generateArticles',
        expect.any(Object),
      );
    });
  });

  describe('service initialization', () => {
    it('should initialize with minimal dependencies', () => {
      const minimalService = new ArticlesContentService(logger, configService);
      expect(minimalService).toBeDefined();
    });

    it('should initialize with all dependencies', () => {
      expect(service).toBeDefined();
      expect(logger).toBeDefined();
      expect(configService).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle missing config service', async () => {
      const mockReplicateService = {} as never;
      const serviceWithoutConfig = new ArticlesContentService(
        logger,
        undefined as unknown as ConfigService,
        undefined,
        undefined,
        undefined,
        mockReplicateService,
      );

      const mockCreateFn = vi.fn();

      await expect(
        serviceWithoutConfig.generateArticles(
          {} as unknown as GenerateArticlesDto,
          'userId',
          'orgId',
          'brandId',
          { generationModel: 'gpt-4o' },
          mockCreateFn,
        ),
      ).rejects.toThrow('Config service not available');
    });
  });
});
