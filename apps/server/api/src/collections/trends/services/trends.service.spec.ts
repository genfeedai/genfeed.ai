import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import { TrendEntity } from '@api/collections/trends/entities/trend.entity';
import {
  Trend,
  type TrendDocument,
} from '@api/collections/trends/schemas/trend.schema';
import { TrendPreferences } from '@api/collections/trends/schemas/trend-preferences.schema';
import { TrendingHashtag } from '@api/collections/trends/schemas/trending-hashtag.schema';
import { TrendingSound } from '@api/collections/trends/schemas/trending-sound.schema';
import { TrendingVideo } from '@api/collections/trends/schemas/trending-video.schema';
import { TrendAnalysisService } from '@api/collections/trends/services/modules/trend-analysis.service';
import { TrendContentIdeasService } from '@api/collections/trends/services/modules/trend-content-ideas.service';
import { TrendFetchService } from '@api/collections/trends/services/modules/trend-fetch.service';
import { TrendFilteringService } from '@api/collections/trends/services/modules/trend-filtering.service';
import { TrendVideoService } from '@api/collections/trends/services/modules/trend-video.service';
import { TrendPreferencesService } from '@api/collections/trends/services/trend-preferences.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ApifyService } from '@api/services/integrations/apify/services/apify.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import { XaiService } from '@api/services/integrations/xai/services/xai.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('TrendsService', () => {
  let service: TrendsService;
  let trendContentIdeasService: TrendContentIdeasService;
  let model: ReturnType<typeof createMockModel>;
  let loggerService: LoggerService;

  const mockOrganizationId = new Types.ObjectId('507f1f77bcf86cd799439011');
  const mockBrandId = new Types.ObjectId('507f1f77bcf86cd799439012');

  const mockTrend: Partial<TrendDocument> = {
    _id: new Types.ObjectId(),
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
    const mockModel = {
      create: vi.fn(),
      exec: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findOne: vi.fn(),
      lean: vi.fn(),
      limit: vi.fn(),
      save: vi.fn(),
      sort: vi.fn(),
      updateMany: vi.fn(),
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
          provide: getModelToken(Trend.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: getModelToken(TrendPreferences.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: getModelToken(TrendingVideo.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: getModelToken(TrendingHashtag.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        {
          provide: getModelToken(TrendingSound.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
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
    model = module.get(getModelToken(Trend.name, DB_CONNECTIONS.CLOUD));
    loggerService = module.get<LoggerService>(LoggerService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitizeForPrompt', () => {
    it('should remove angle brackets', () => {
      const result = (trendContentIdeasService as any).sanitizeForPrompt(
        '<script>alert("xss")</script>',
      );
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should limit consecutive newlines', () => {
      const result = (trendContentIdeasService as any).sanitizeForPrompt(
        'line1\n\n\n\n\nline2',
      );
      expect(result).toBe('line1\n\nline2');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(3000);
      const result = (trendContentIdeasService as any).sanitizeForPrompt(
        longString,
      );
      expect(result.length).toBe(2000);
    });

    it('should handle numbers', () => {
      const result = (trendContentIdeasService as any).sanitizeForPrompt(12345);
      expect(result).toBe('12345');
    });
  });

  describe('callWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockOperation = vi.fn().mockResolvedValue({ success: true });

      const result = await (trendContentIdeasService as any).callWithRetry(
        mockOperation,
        3,
        1,
      );

      expect(result).toEqual({ success: true });
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry and eventually succeed', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ success: true });

      const result = await (trendContentIdeasService as any).callWithRetry(
        mockOperation,
        3,
        1,
      );

      expect(result).toEqual({ success: true });
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const mockOperation = vi
        .fn()
        .mockRejectedValue(new Error('Persistent error'));

      await expect(
        (trendContentIdeasService as any).callWithRetry(mockOperation, 2, 1),
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

      const result = (trendContentIdeasService as any).parseAIResponse(
        validResponse,
        'tiktok',
      );

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('AI Tutorial');
    });

    it('should throw error when no JSON array found', () => {
      const invalidResponse = 'No JSON here!';

      expect(() =>
        (trendContentIdeasService as any).parseAIResponse(
          invalidResponse,
          'tiktok',
        ),
      ).toThrow('No JSON array found in response');

      expect(loggerService.error).toHaveBeenCalledWith(
        'No JSON array found in AI response',
        expect.any(Error),
        expect.any(Object),
      );
    });

    it('should return empty array on malformed JSON', () => {
      const malformedResponse = '[{ "title": "test", }]'; // Trailing comma

      const result = (trendContentIdeasService as any).parseAIResponse(
        malformedResponse,
        'tiktok',
      );

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

      const result = (trendContentIdeasService as any).parseAIResponse(
        invalidIdea,
        'tiktok',
      );

      expect(result).toEqual([]);
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('should warn on empty array', () => {
      const emptyResponse = '[]';

      const result = (trendContentIdeasService as any).parseAIResponse(
        emptyResponse,
        'tiktok',
      );

      expect(result).toEqual([]);
      expect(loggerService.warn).toHaveBeenCalledWith(
        'AI returned empty ideas array',
        expect.any(Object),
      );
    });
  });

  describe('getTrendContent', () => {
    it('aggregates, dedupes, and ranks content items from cached previews', async () => {
      const cachedTrendA = {
        ...mockTrend,
        _id: new Types.ObjectId('507f1f77bcf86cd799439021'),
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
      };

      const cachedTrendB = {
        ...mockTrend,
        _id: new Types.ObjectId('507f1f77bcf86cd799439022'),
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
      };

      vi.spyOn(service, 'getTrendsWithAccessControl').mockResolvedValue({
        connectedPlatforms: ['twitter'],
        lockedPlatforms: ['instagram'],
        trends: [cachedTrendA, cachedTrendB].map(
          (trend) => new TrendEntity(trend as never),
        ),
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
            _id: new Types.ObjectId('507f1f77bcf86cd799439023'),
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

      await service.getTrendsWithAccessControl(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
      );

      expect(getPreferencesSpy).toHaveBeenCalledWith(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
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

      await service.getTrendsWithAccessControl(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
      );

      expect(getPreferencesSpy).toHaveBeenCalledWith(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
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
      const brandAId = mockBrandId.toString();
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

      await service.getTrendsWithAccessControl(
        mockOrganizationId.toString(),
        brandAId,
      );
      await service.getTrendsWithAccessControl(
        mockOrganizationId.toString(),
        brandBId,
      );

      expect(getPreferencesSpy).toHaveBeenNthCalledWith(
        1,
        mockOrganizationId.toString(),
        brandAId,
      );
      expect(getPreferencesSpy).toHaveBeenNthCalledWith(
        2,
        mockOrganizationId.toString(),
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

      // (5000000 / 10000000 * 100 * 0.5) + (60 * 0.3) + (recency * 0.2)
      // Recency is ~100 for freshly created trend (createdAt is undefined here = 0 age)
      // = (50 * 0.5) + 18 + (100 * 0.2) = 25 + 18 + 20 = 63
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

      // (0 * 0.5) + (50 * 0.3) + (recency * 0.2) = 0 + 15 + recency
      // recency ~20 for createdAt=undefined
      expect(score).toBeGreaterThanOrEqual(31);
      expect(score).toBeLessThanOrEqual(37);
    });
  });

  describe('getTrends', () => {
    it('should return cached trends if available', async () => {
      const mockTrends = [
        mockTrend,
        { ...mockTrend, _id: new Types.ObjectId() },
      ];

      model.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue(mockTrends),
          }),
        }),
      });

      const result = await service.getTrends(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
      );

      expect(result).toHaveLength(2);
      expect(model.find).toHaveBeenCalledWith({
        brand: mockBrandId.toString(),
        expiresAt: { $gt: expect.any(Date) },
        isCurrent: true,
        isDeleted: false,
        organization: mockOrganizationId.toString(),
      });
    });

    it('should filter by platform when specified', async () => {
      model.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([mockTrend]),
          }),
        }),
      });

      await service.getTrends(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
        'tiktok',
      );

      expect(model.find).toHaveBeenCalledWith({
        brand: mockBrandId.toString(),
        expiresAt: { $gt: expect.any(Date) },
        isCurrent: true,
        isDeleted: false,
        organization: mockOrganizationId.toString(),
        platform: 'tiktok',
      });
    });

    it('should return empty without live fetch when cache is missing and fetching is disabled', async () => {
      model.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const fetchAndCacheTrendsSpy = vi.spyOn(service, 'fetchAndCacheTrends');

      const result = await service.getTrends(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
        undefined,
        {
          allowFetchIfMissing: false,
        },
      );

      expect(result).toEqual([]);
      expect(fetchAndCacheTrendsSpy).not.toHaveBeenCalled();
    });

    it('should fall back to global cached trends when tenant-scoped trends are missing', async () => {
      model.find
        .mockReturnValueOnce({
          sort: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          sort: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([mockTrend]),
            }),
          }),
        });

      const result = await service.getTrends(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
        undefined,
        {
          allowFetchIfMissing: false,
        },
      );

      expect(result).toHaveLength(1);
      expect(model.find).toHaveBeenNthCalledWith(1, {
        brand: mockBrandId.toString(),
        expiresAt: { $gt: expect.any(Date) },
        isCurrent: true,
        isDeleted: false,
        organization: mockOrganizationId.toString(),
      });
      expect(model.find).toHaveBeenNthCalledWith(2, {
        brand: null,
        expiresAt: { $gt: expect.any(Date) },
        isCurrent: true,
        isDeleted: false,
        organization: null,
      });
    });

    it('should invoke the live fetch path when neither tenant nor global cache has trends', async () => {
      model.find
        .mockReturnValueOnce({
          sort: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        })
        .mockReturnValueOnce({
          sort: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue([]),
            }),
          }),
        });

      const fetchedTrend = new TrendEntity({
        ...mockTrend,
        platform: 'twitter',
        topic: 'Fresh live trend',
      } as never);

      const fetchAndCacheTrendsSpy = vi
        .spyOn(service, 'fetchAndCacheTrends')
        .mockResolvedValue([fetchedTrend]);

      const result = await service.getTrends(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
      );

      expect(fetchAndCacheTrendsSpy).toHaveBeenCalledWith(
        mockOrganizationId.toString(),
        mockBrandId.toString(),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        platform: 'twitter',
        topic: 'Fresh live trend',
      });
    });
  });
});
