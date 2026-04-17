import { ArticlesService } from '@api/collections/articles/services/articles.service';
import { ConfigService } from '@api/config/config.service';
import { RssService } from '@api/endpoints/public/services/rss.service';
import { ArticleScope, ArticleStatus } from '@genfeedai/enums';
import { Test, TestingModule } from '@nestjs/testing';

describe('RssService', () => {
  let service: RssService;
  let articlesService: vi.Mocked<ArticlesService>;

  const mockArticles = [
    {
      _id: 'test-object-id',
      content: 'Test content 1',
      createdAt: new Date('2024-01-01'),
      isDeleted: false,
      label: 'Test Article 1',
      publishedAt: new Date('2024-01-01'),
      scope: ArticleScope.PUBLIC,
      slug: 'test-article-1',
      status: ArticleStatus.PUBLIC,
      summary: 'Test summary 1',
    },
    {
      _id: 'test-object-id',
      content: 'Test content 2',
      createdAt: new Date('2024-01-02'),
      isDeleted: false,
      label: 'Test Article 2',
      publishedAt: new Date('2024-01-02'),
      scope: ArticleScope.PUBLIC,
      slug: 'test-article-2',
      status: ArticleStatus.PUBLIC,
      summary: 'Test summary 2',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RssService,
        {
          provide: ArticlesService,
          useValue: {
            findAll: vi.fn().mockResolvedValue({ docs: mockArticles }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'GENFEEDAI_APP_URL') {
                return 'https://genfeed.ai';
              }
              if (key === 'GENFEEDAI_API_URL') {
                return 'https://api.genfeed.ai';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RssService>(RssService);
    articlesService = module.get(ArticlesService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateGlobalFeed', () => {
    it('should generate RSS feed with articles', async () => {
      const feed = await service.generateGlobalFeed();

      expect(feed).toBeDefined();
      expect(typeof feed).toBe('string');
      expect(feed).toContain('<?xml');
      expect(feed).toContain('Genfeed Articles');
      expect(feed).toContain('Test Article 1');
      expect(feed).toContain('Test Article 2');
    });

    it('should query for public published articles', async () => {
      await service.generateGlobalFeed();

      expect(articlesService.findAll).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: {
              isDeleted: false,
              scope: ArticleScope.PUBLIC,
              status: ArticleStatus.PUBLIC,
            },
          }),
          expect.objectContaining({ $limit: 100 }),
        ]),
        { pagination: false },
      );
    });

    it('should handle empty articles list', async () => {
      (articlesService.findAll as vi.Mock).mockResolvedValue({ docs: [] });

      const feed = await service.generateGlobalFeed();

      expect(feed).toBeDefined();
      expect(feed).toContain('<?xml');
      expect(feed).toContain('Genfeed Articles');
    });

    it('should include article URLs in feed', async () => {
      const feed = await service.generateGlobalFeed();

      expect(feed).toContain('https://genfeed.ai/articles/test-article-1');
      expect(feed).toContain('https://genfeed.ai/articles/test-article-2');
    });

    it('should include article summaries', async () => {
      const feed = await service.generateGlobalFeed();

      expect(feed).toContain('Test summary 1');
      expect(feed).toContain('Test summary 2');
    });
  });
});
