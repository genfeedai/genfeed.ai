import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import type { TrendDocument } from '@api/collections/trends/schemas/trend.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@api/collections/trends/services/modules/trend-content-ideas.service';
import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { XaiService } from '@api/services/integrations/xai/services/xai.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('TrendsService', () => {
  let service: TrendsService;
  let trendContentIdeasService: TrendContentIdeasService;
  let prisma: {
    trend: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let loggerService: LoggerService;

  const mockOrganizationId = '507f1f77bcf86cd799439011';
  const mockBrandId = '507f1f77bcf86cd799439012';

  // A Prisma-style trend doc (with data blob containing the rich fields)
  const makePrismaTrendDoc = (
    overrides: Partial<Record<string, unknown>> = {},
  ) => ({
    brandId: mockBrandId,
    createdAt: new Date(),
    data: {
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      growthRate: 85,
      isCurrent: true,
      isDeleted: false,
      mentions: 1000000,
      metadata: {
        hashtags: ['#AI', '#tech'],
        sampleContent: 'Sample content',
        urls: [],
      },
      platform: 'tiktok',
      requiresAuth: false,
      topic: 'AI trends',
      viralityScore: 75,
      ...overrides,
    },
    id: 'trend-id-1',
    isDeleted: false,
    organizationId: mockOrganizationId,
    updatedAt: new Date(),
  });

  // A TrendEntity-like object (flattened) for spy returns
  const mockTrend: Partial<TrendDocument> = {
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    growthRate: 85,
    isDeleted: false,
    mentions: 1000000,
    metadata: {
      hashtags: ['#AI', '#tech'],
      sampleContent: 'Sample content',
      urls: [],
    },
    platform: 'tiktok',
    requiresAuth: false,
    topic: 'AI trends',
    updatedAt: new Date(),
    viralityScore: 75,
  };

  beforeEach(async () => {
    prisma = {
      trend: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mockEmptyService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendsService,
        TrendAnalysisService,
        TrendContentIdeasService,
        TrendFetchService,
        TrendFilteringService,
        TrendVideoService,
        TrendPreferencesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            verbose: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ModelsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              cost: 10,
              key: 'leonardoai',
            }),
          },
        },
        {
          provide: BrandsService,
          useValue: mockEmptyService,
        },
        {
          provide: CredentialsService,
          useValue: {
            findAll: vi.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            generateKey: vi.fn((...args: string[]) => args.join(':')),
            get: vi.fn().mockResolvedValue(null),
            invalidateByTags: vi.fn().mockResolvedValue(0),
            set: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: TrendReferenceCorpusService,
          useValue: {
            annotateSourceItemsWithReferenceIds: vi.fn(async (items) =>
              items.map((item) => ({
                ...item,
                sourceReferenceId:
                  item.sourceUrl === 'https://x.com/example/status/1'
                    ? 'ref-1'
                    : undefined,
              })),
            ),
            getReferenceCorpus: vi.fn(),
            getTopReferenceAccounts: vi.fn(),
            recordDraftRemixLineage: vi.fn(),
            syncTrendReferences: vi.fn().mockResolvedValue({
              links: 0,
              references: 0,
              snapshots: 0,
            }),
          },
        },
        {
          provide: ApifyService,
          useValue: mockEmptyService,
        },
        {
          provide: ReplicateService,
          useValue: mockEmptyService,
        },
        {
          provide: XaiService,
          useValue: mockEmptyService,
        },
        {
          provide: LinkedInService,
          useValue: {
            getTrends: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TrendsService>(TrendsService);
    trendContentIdeasService = module.get<TrendContentIdeasService>(
      TrendContentIdeasService,
    );
    loggerService = module.get<LoggerService>(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitizeForPrompt', () => {
    it('should remove angle brackets', () => {
      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: string) => string
        >
      ).sanitizeForPrompt('<script>alert("xss")</script>');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should limit consecutive newlines', () => {
      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: string) => string
        >
      ).sanitizeForPrompt('line1\n\n\n\n\nline2');
      expect(result).toBe('line1\n\nline2');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(3000);
      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: string) => string
        >
      ).sanitizeForPrompt(longString);
      expect(result.length).toBe(2000);
    });

    it('should handle numbers', () => {
      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: unknown) => string
        >
      ).sanitizeForPrompt(12345);
      expect(result).toBe('12345');
    });
  });

  describe('callWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockOperation = vi.fn().mockResolvedValue({ success: true });

      const result = await (
        trendContentIdeasService as unknown as Record<
          string,
          (
            fn: () => Promise<unknown>,
            retries: number,
            delay: number,
          ) => Promise<unknown>
        >
      ).callWithRetry(mockOperation, 3, 1);

      expect(result).toEqual({ success: true });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry and eventually succeed', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ success: true });

      const result = await (
        trendContentIdeasService as unknown as Record<
          string,
          (
            fn: () => Promise<unknown>,
            retries: number,
            delay: number,
          ) => Promise<unknown>
        >
      ).callWithRetry(mockOperation, 3, 1);

      expect(result).toEqual({ success: true });
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      await expect(
        (
          trendContentIdeasService as unknown as Record<
            string,
            (
              fn: () => Promise<unknown>,
              retries: number,
              delay: number,
            ) => Promise<unknown>
          >
        ).callWithRetry(mockOperation, 2, 1),
      ).rejects.toThrow('Persistent error');

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('parseAIResponse', () => {
    it('should parse valid JSON response', () => {
      const validResponse = `Here are some ideas:
[
  {
    "title": "AI Tutorial",
    "description": "Learn AI basics",
    "contentType": "video",
    "hashtags": ["#AI", "#tutorial"],
    "caption": "Learn AI today!",
    "estimatedViews": "10K-50K"
  }
]`;

      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: string, p: string) => unknown[]
        >
      ).parseAIResponse(validResponse, 'tiktok');

      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, string>).title).toBe('AI Tutorial');
    });

    it('should throw error when no JSON array found', () => {
      const invalidResponse = 'No JSON here!';

      expect(() =>
        (
          trendContentIdeasService as unknown as Record<
            string,
            (s: string, p: string) => unknown
          >
        ).parseAIResponse(invalidResponse, 'tiktok'),
      ).toThrow('No JSON array found in response');

      expect(loggerService.error).toHaveBeenCalledWith(
        'No JSON array found in AI response',
        expect.any(Error),
        expect.any(Object),
      );
    });

    it('should return empty array on malformed JSON', () => {
      const malformedResponse = '[{ "title": "test", }]';

      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: string, p: string) => unknown[]
        >
      ).parseAIResponse(malformedResponse, 'tiktok');

      expect(result).toEqual([]);
      expect(loggerService.error).toHaveBeenCalledWith(
        'Failed to parse or validate AI response',
        expect.any(Error),
      );
    });

    it('should validate idea structure', () => {
      const invalidIdea = `[
  {
    "title": "AI Tutorial"
  }
]`;

      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: string, p: string) => unknown[]
        >
      ).parseAIResponse(invalidIdea, 'tiktok');

      expect(result).toEqual([]);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should warn on empty array', () => {
      const emptyResponse = '[]';

      const result = (
        trendContentIdeasService as unknown as Record<
          string,
          (s: string, p: string) => unknown[]
        >
      ).parseAIResponse(emptyResponse, 'tiktok');

      expect(result).toEqual([]);
      expect(loggerService.warn).toHaveBeenCalledWith(
        'AI returned empty ideas array',
        expect.any(Object),
      );
    });
  });

  describe('getTrendContent', () => {
    it('aggregates, dedupes, and ranks content items from cached previews', async () => {
      const cachedTrendA = new TrendEntity({
        ...mockTrend,
        id: '507f1f77bcf86cd799439021',
        metadata: {
          sourcePreviewCache: [
            {
              contentType: 'tweet',
              id: 'source-a',
              metrics: {
                likes: 120,
              },
              platform: 'twitter',
              sourceUrl: 'https://x.com/example/status/1',
              text: 'Tweet A',
            },
          ],
          sourcePreviewState: 'live',
        },
        platform: 'twitter',
        topic: '#AIAgents',
        viralityScore: 90,
      } as never);

      const cachedTrendB = new TrendEntity({
        ...mockTrend,
        id: '507f1f77bcf86cd799439022',
        metadata: {
          sourcePreviewCache: [
            {
              contentType: 'tweet',
              id: 'source-b',
              metrics: {
                likes: 50,
              },
              platform: 'twitter',
              sourceUrl: 'https://x.com/example/status/1',
              text: 'Tweet A duplicate',
            },
            {
              contentType: 'tweet',
              id: 'source-c-fallback',
              platform: 'twitter',
              sourceUrl: 'https://x.com/example/status/3',
              text: 'Tweet C',
            },
          ],
          sourcePreviewState: 'live',
        },
        platform: 'twitter',
        topic: '#AIWorkflow',
        viralityScore: 70,
      } as never);

      vi.spyOn(service, 'getTrendsWithAccessControl').mockResolvedValue({
        connectedPlatforms: ['twitter'],
        lockedPlatforms: ['instagram'],
        trends: [cachedTrendA, cachedTrendB],
      });

      const result = await service.getTrendContent('org-1', 'brand-1', {
        limit: 10,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({
        matchedTrends: ['#AIAgents', '#AIWorkflow'],
        platform: 'twitter',
        sourcePreviewState: 'live',
        sourceReferenceId: 'ref-1',
        sourceUrl: 'https://x.com/example/status/1',
        trendTopic: '#AIAgents',
        trendViralityScore: 90,
      });
      expect(result.items[1]?.sourcePreviewState).toBe('fallback');
      expect(result.lockedPlatforms).toEqual(['instagram']);
    });

    it('excludes linkedin from the public content feed', async () => {
      vi.spyOn(service, 'getTrendsWithAccessControl').mockResolvedValue({
        connectedPlatforms: [],
        lockedPlatforms: ['linkedin'],
        trends: [
          new TrendEntity({
            ...mockTrend,
            id: '507f1f77bcf86cd799439023',
            metadata: {
              source: 'curated',
            },
            platform: 'linkedin',
            topic: '#Leadership',
          } as never),
        ],
      });

      const result = await service.getTrendContent('org-1', 'brand-1');

      expect(result.items).toEqual([]);
    });
  });

  describe('getTrendsWithAccessControl', () => {
    it('applies brand-scoped preferences when the active brand has its own record', async () => {
      const trendPreferencesService = (
        service as unknown as {
          trendPreferencesService: TrendPreferencesService;
        }
      ).trendPreferencesService;
      const trendFilteringService = (
        service as unknown as {
          trendFilteringService: TrendFilteringService;
        }
      ).trendFilteringService;

      vi.spyOn(service, 'getConnectedPlatforms').mockResolvedValue(['twitter']);
      vi.spyOn(service, 'getTrends').mockResolvedValue([
        new TrendEntity(mockTrend as never),
      ]);

      const getPreferencesSpy = vi
        .spyOn(trendPreferencesService, 'getPreferences')
        .mockResolvedValue({
          categories: ['ai'],
          hashtags: ['#agent'],
          keywords: ['workflow'],
          platforms: ['twitter'],
        } as never);
      const filterByPreferencesSpy = vi
        .spyOn(trendFilteringService, 'filterTrendsByPreferences')
        .mockImplementation((trends) => trends);

      await service.getTrendsWithAccessControl(mockOrganizationId, mockBrandId);

      expect(getPreferencesSpy).toHaveBeenCalledWith(
        mockOrganizationId,
        mockBrandId,
      );
      expect(filterByPreferencesSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          categories: ['ai'],
          hashtags: ['#agent'],
          keywords: ['workflow'],
          platforms: ['twitter'],
        }),
      );
    });

    it('falls back to org defaults when the active brand has no override', async () => {
      const trendPreferencesService = (
        service as unknown as {
          trendPreferencesService: TrendPreferencesService;
        }
      ).trendPreferencesService;
      const trendFilteringService = (
        service as unknown as {
          trendFilteringService: TrendFilteringService;
        }
      ).trendFilteringService;

      vi.spyOn(service, 'getConnectedPlatforms').mockResolvedValue(['twitter']);
      vi.spyOn(service, 'getTrends').mockResolvedValue([
        new TrendEntity(mockTrend as never),
      ]);

      const getPreferencesSpy = vi
        .spyOn(trendPreferencesService, 'getPreferences')
        .mockResolvedValue({
          categories: ['org-default'],
          hashtags: [],
          keywords: ['baseline'],
          platforms: ['twitter'],
        } as never);
      const filterByPreferencesSpy = vi
        .spyOn(trendFilteringService, 'filterTrendsByPreferences')
        .mockImplementation((trends) => trends);

      await service.getTrendsWithAccessControl(mockOrganizationId, mockBrandId);

      expect(getPreferencesSpy).toHaveBeenCalledWith(
        mockOrganizationId,
        mockBrandId,
      );
      expect(filterByPreferencesSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          categories: ['org-default'],
          keywords: ['baseline'],
        }),
      );
    });

    it('does not leak one brand preference set into another brand request', async () => {
      const trendPreferencesService = (
        service as unknown as {
          trendPreferencesService: TrendPreferencesService;
        }
      ).trendPreferencesService;
      const trendFilteringService = (
        service as unknown as {
          trendFilteringService: TrendFilteringService;
        }
      ).trendFilteringService;
      const brandAId = mockBrandId;
      const brandBId = '507f1f77bcf86cd799439013';

      vi.spyOn(service, 'getConnectedPlatforms').mockResolvedValue(['twitter']);
      vi.spyOn(service, 'getTrends').mockResolvedValue([
        new TrendEntity(mockTrend as never),
      ]);

      const getPreferencesSpy = vi
        .spyOn(trendPreferencesService, 'getPreferences')
        .mockImplementation(async (_organizationId, activeBrandId) => {
          if (activeBrandId === brandAId) {
            return {
              categories: ['brand-a'],
              hashtags: [],
              keywords: ['alpha'],
              platforms: ['twitter'],
            } as never;
          }

          if (activeBrandId === brandBId) {
            return {
              categories: ['brand-b'],
              hashtags: [],
              keywords: ['beta'],
              platforms: ['twitter'],
            } as never;
          }

          return null;
        });
      const filterByPreferencesSpy = vi
        .spyOn(trendFilteringService, 'filterTrendsByPreferences')
        .mockImplementation((trends) => trends);

      await service.getTrendsWithAccessControl(mockOrganizationId, brandAId);
      await service.getTrendsWithAccessControl(mockOrganizationId, brandBId);

      expect(getPreferencesSpy).toHaveBeenNthCalledWith(
        1,
        mockOrganizationId,
        brandAId,
      );
      expect(getPreferencesSpy).toHaveBeenNthCalledWith(
        2,
        mockOrganizationId,
        brandBId,
      );
      expect(filterByPreferencesSpy).toHaveBeenNthCalledWith(
        1,
        expect.any(Array),
        expect.objectContaining({
          categories: ['brand-a'],
          keywords: ['alpha'],
        }),
      );
      expect(filterByPreferencesSpy).toHaveBeenNthCalledWith(
        2,
        expect.any(Array),
        expect.objectContaining({
          categories: ['brand-b'],
          keywords: ['beta'],
        }),
      );
    });
  });

  describe('calculateViralityScore', () => {
    it('should calculate virality score correctly', () => {
      const trendData = {
        growthRate: 60,
        mentions: 5000000,
        metadata: {},
        platform: 'tiktok',
        topic: 'AI',
      };

      const score = service.calculateViralityScore(trendData);

      expect(score).toBeGreaterThanOrEqual(59);
      expect(score).toBeLessThanOrEqual(65);
    });

    it('should cap score at 100', () => {
      const trendData = {
        growthRate: 100,
        mentions: 50000000,
        metadata: {},
        platform: 'tiktok',
        topic: 'Viral',
      };

      const score = service.calculateViralityScore(trendData);

      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle zero mentions', () => {
      const trendData = {
        growthRate: 50,
        mentions: 0,
        metadata: {},
        platform: 'tiktok',
        topic: 'New',
      };

      const score = service.calculateViralityScore(trendData);

      expect(score).toBeGreaterThanOrEqual(31);
      expect(score).toBeLessThanOrEqual(37);
    });
  });

  describe('getTrends', () => {
    it('should return cached trends when prisma.trend.findMany returns active docs', async () => {
      const doc = makePrismaTrendDoc();
      prisma.trend.findMany.mockResolvedValue([doc]);

      const result = await service.getTrends(mockOrganizationId, mockBrandId);

      expect(result).toHaveLength(1);
      expect(prisma.trend.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: mockBrandId,
            isDeleted: false,
            organizationId: mockOrganizationId,
          }),
        }),
      );
    });

    it('should filter by platform in-memory when specified', async () => {
      const tikTokDoc = makePrismaTrendDoc({ platform: 'tiktok' });
      const instagramDoc = makePrismaTrendDoc({ platform: 'instagram' });
      prisma.trend.findMany.mockResolvedValue([tikTokDoc, instagramDoc]);

      const result = await service.getTrends(
        mockOrganizationId,
        mockBrandId,
        'tiktok',
      );

      expect(result).toHaveLength(1);
      expect(result[0].platform).toBe('tiktok');
    });

    it('should return empty without live fetch when cache is missing and fetching is disabled', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      const fetchAndCacheTrendsSpy = vi.spyOn(service, 'fetchAndCacheTrends');

      const result = await service.getTrends(
        mockOrganizationId,
        mockBrandId,
        undefined,
        {
          allowFetchIfMissing: false,
        },
      );

      expect(result).toEqual([]);
      expect(fetchAndCacheTrendsSpy).not.toHaveBeenCalled();
    });

    it('should fall back to global cached trends when tenant-scoped trends are missing', async () => {
      const globalDoc = makePrismaTrendDoc();
      prisma.trend.findMany
        .mockResolvedValueOnce([]) // tenant-scoped = empty
        .mockResolvedValueOnce([globalDoc]); // global = has data

      const result = await service.getTrends(
        mockOrganizationId,
        mockBrandId,
        undefined,
        {
          allowFetchIfMissing: false,
        },
      );

      expect(result).toHaveLength(1);
      // First call: tenant-scoped
      expect(prisma.trend.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: mockBrandId,
            organizationId: mockOrganizationId,
          }),
        }),
      );
      // Second call: global fallback
      expect(prisma.trend.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: null,
            organizationId: null,
          }),
        }),
      );
    });

    it('should invoke the live fetch path when neither tenant nor global cache has trends', async () => {
      prisma.trend.findMany.mockResolvedValue([]);

      const fetchedTrend = new TrendEntity({
        ...mockTrend,
        platform: 'twitter',
        topic: 'Fresh live trend',
      } as never);

      const fetchAndCacheTrendsSpy = vi
        .spyOn(service, 'fetchAndCacheTrends')
        .mockResolvedValue([fetchedTrend]);

      const result = await service.getTrends(mockOrganizationId, mockBrandId);

      expect(fetchAndCacheTrendsSpy).toHaveBeenCalledWith(
        mockOrganizationId,
        mockBrandId,
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        platform: 'twitter',
        topic: 'Fresh live trend',
      });
    });
  });
});
