vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnBadRequest: vi.fn((response) => {
    throw { response, status: 400 };
  }),
  returnNotFound: vi.fn((type, id) => ({
    errors: [
      { detail: `${type} ${id} not found`, status: '404', title: 'Not Found' },
    ],
  })),
  serializeCollection: vi.fn((_req, _serializer, data) => ({
    data: data.docs || data,
  })),
  serializeSingle: vi.fn((_req, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { TrendsDiscoveryController } from '@api/collections/trends/controllers/trends-discovery.controller';
import { GenerateTrendIdeasDto } from '@api/collections/trends/dto/trend-ideas.dto';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import { testId } from '@helpers/testing/test-id.helper';
import type { Request } from 'express';

describe('TrendsController', () => {
  let controller: TrendsController;
  let discoveryController: TrendsDiscoveryController;
  let trendsService: TrendsService;
  let creditsUtilsService: {
    checkOrganizationCreditsAvailable: ReturnType<typeof vi.fn>;
    getOrganizationCreditsBalance: ReturnType<typeof vi.fn>;
  };
  let modelsService: {
    findOne: ReturnType<typeof vi.fn>;
  };

  const mockTrend = {
    growthRate: 150,
    lastUpdated: new Date(),
    mentions: 12500,
    platform: 'twitter',
    topic: 'AI Development',
    viralityScore: 85,
  };

  const mockUser = {
    id: 'user_123',
    brandId: testId('brand'),
    organizationId: testId('org'),
    userId: testId('user'),
  } as unknown as User;

  const mockReq = {} as Request;

  const mockTrendsService = {
    fetchAndCacheHashtags: vi.fn(),
    fetchAndCacheSounds: vi.fn(),
    fetchAndCacheViralVideos: vi.fn(),
    generateContentIdeas: vi.fn(),
    getCorpusFreshnessHealth: vi.fn(),
    getPromptReferencePacks: vi.fn(),
    getReferenceCorpus: vi.fn(),
    getTopReferenceAccounts: vi.fn(),
    getTrendContent: vi.fn(),
    getTrendingHashtags: vi.fn(),
    getTrendingSounds: vi.fn(),
    getTrendSourceItems: vi.fn(),
    getTrends: vi.fn(),
    getTrendsDiscovery: vi.fn(),
    getTrendsWithAccessControl: vi.fn(),
    getViralLeaderboard: vi.fn(),
    getViralVideos: vi.fn(),
    refreshTrends: vi.fn(),
  };

  const mockTrendPreferencesService = {
    getPreferences: vi.fn(),
    savePreferences: vi.fn(),
  };

  beforeEach(async () => {
    creditsUtilsService = {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn(),
    };
    modelsService = {
      findOne: vi.fn().mockResolvedValue({
        pricing: { input: 1, output: 1 },
      }),
    };
    controller = new TrendsController(
      mockTrendsService as never,
      mockTrendPreferencesService as never,
      creditsUtilsService as never,
      modelsService as never,
    );
    discoveryController = new TrendsDiscoveryController(
      mockTrendsService as never,
    );
    trendsService = mockTrendsService as never;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getTrends', () => {
    it('should return trends with access control', async () => {
      const mockResult = {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: ['instagram', 'tiktok'],
        trends: [mockTrend],
      };

      mockTrendsService.getTrendsWithAccessControl.mockResolvedValue(
        mockResult,
      );

      const result = await controller.getTrends(
        mockReq,
        mockUser,
        'twitter',
        'false',
      );

      expect(trendsService.getTrendsWithAccessControl).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        'twitter',
      );
      expect(result).toBeDefined();
      expect(result).toHaveProperty('data');
      expect(result.data).toEqual(mockResult.trends);
    });

    it('should refresh trends when refresh parameter is true', async () => {
      const mockResult = {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: [],
        trends: [mockTrend],
      };

      mockTrendsService.refreshTrends.mockResolvedValue([mockTrend]);
      mockTrendsService.getTrendsWithAccessControl.mockResolvedValue(
        mockResult,
      );

      const result = await controller.getTrends(
        mockReq,
        mockUser,
        'twitter',
        'true',
      );

      expect(trendsService.refreshTrends).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
      );
      expect(result).toBeDefined();
    });
  });

  describe('getTrendsDiscovery', () => {
    it('should return plain discovery payload with summary and trends', async () => {
      const mockResult = {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: ['instagram', 'tiktok'],
        trends: [mockTrend],
      };

      mockTrendsService.getTrendsDiscovery.mockResolvedValue(mockResult);

      const result = await discoveryController.getTrendsDiscovery(
        mockUser,
        'twitter',
        undefined,
      );

      expect(trendsService.getTrendsDiscovery).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        'twitter',
      );
      expect(result).toEqual({
        summary: {
          connectedPlatforms: ['twitter'],
          lockedPlatforms: ['instagram', 'tiktok'],
          totalTrends: 1,
        },
        trends: [mockTrend],
      });
    });

    it('should refresh discovery payload when refresh parameter is true', async () => {
      const mockResult = {
        connectedPlatforms: ['twitter'],
        lockedPlatforms: [],
        trends: [mockTrend],
      };

      mockTrendsService.refreshTrends.mockResolvedValue([mockTrend]);
      mockTrendsService.getTrendsDiscovery.mockResolvedValue(mockResult);

      await discoveryController.getTrendsDiscovery(mockUser, undefined, 'true');

      expect(trendsService.refreshTrends).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
      );
    });
  });

  describe('getTrendContent', () => {
    it('should return a plain content payload with summary and items', async () => {
      const mockResult = {
        connectedPlatforms: ['twitter'],
        items: [
          {
            contentRank: 100,
            contentType: 'tweet',
            id: 'content-1',
            matchedTrends: ['#AIAgents'],
            platform: 'twitter',
            requiresAuth: false,
            sourcePreviewState: 'live',
            sourceUrl: 'https://x.com/builder/status/1',
            text: 'Actual tweet content',
            trendId: 'trend-1',
            trendMentions: 20000,
            trendTopic: '#AIAgents',
            trendViralityScore: 90,
          },
        ],
        lockedPlatforms: ['instagram'],
      };

      mockTrendsService.getTrendContent.mockResolvedValue(mockResult);

      const result = await discoveryController.getTrendContent(
        mockUser,
        'twitter',
        '12',
        undefined,
      );

      expect(trendsService.getTrendContent).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        {
          limit: 12,
          platform: 'twitter',
          refresh: false,
        },
      );
      expect(result).toEqual({
        items: mockResult.items,
        summary: {
          connectedPlatforms: ['twitter'],
          lockedPlatforms: ['instagram'],
          totalItems: 1,
          totalTrends: 1,
        },
      });
    });

    it('should pass refresh through to content generation', async () => {
      mockTrendsService.getTrendContent.mockResolvedValue({
        connectedPlatforms: [],
        items: [],
        lockedPlatforms: [],
      });

      await discoveryController.getTrendContent(
        mockUser,
        undefined,
        undefined,
        'true',
      );

      expect(trendsService.getTrendContent).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        expect.objectContaining({
          refresh: true,
        }),
      );
    });
  });

  describe('getReferenceCorpus', () => {
    it('should return the historical reference corpus payload', async () => {
      mockTrendsService.getReferenceCorpus.mockResolvedValue({
        items: [
          {
            authorHandle: 'builder',
            canonicalUrl: 'https://x.com/builder/status/1',
            contentType: 'tweet',
            currentEngagementTotal: 1200,
            firstSeenAt: '2026-03-25T00:00:00.000Z',
            id: 'ref-1',
            lastSeenAt: '2026-03-25T00:00:00.000Z',
            latestTrendMentions: 12000,
            latestTrendViralityScore: 80,
            matchedTrendTopics: ['#AIAgents'],
            platform: 'twitter',
            remixCount: 2,
            sourceClassification: {
              capturedAt: '2026-03-25T00:00:00.000Z',
              confidence: 'medium',
              freshnessWindowDays: 2,
              intendedUse: 'organic_trend_discovery',
              sourceKind: 'public_platform_reference',
              sourceLabel: 'X / Twitter',
              sourceTopic: '#AIAgents',
            },
            sourcePreviewState: 'live',
          },
        ],
        totalReferences: 1,
      });

      const result = await discoveryController.getReferenceCorpus(
        mockUser,
        'twitter',
        'trend-1',
        'builder',
        undefined,
        undefined,
        undefined,
        '15',
      );

      expect(trendsService.getReferenceCorpus).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        {
          authorHandle: 'builder',
          includePaidCreative: undefined,
          intendedUse: undefined,
          limit: 15,
          platform: 'twitter',
          sourceKind: undefined,
          trendId: 'trend-1',
        },
      );
      expect(result).toEqual({
        items: [
          expect.objectContaining({
            id: 'ref-1',
            sourceClassification: expect.objectContaining({
              sourceKind: 'public_platform_reference',
            }),
          }),
        ],
        summary: {
          totalReferences: 1,
        },
      });
    });

    it('passes explicit paid creative filters to the reference corpus service', async () => {
      mockTrendsService.getReferenceCorpus.mockResolvedValue({
        items: [],
        totalReferences: 0,
      });

      await discoveryController.getReferenceCorpus(
        mockUser,
        undefined,
        undefined,
        undefined,
        'paid_creative_reference',
        'paid_creative_analysis',
        'true',
        '10',
      );

      expect(trendsService.getReferenceCorpus).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        {
          authorHandle: undefined,
          includePaidCreative: true,
          intendedUse: 'paid_creative_analysis',
          limit: 10,
          platform: undefined,
          sourceKind: 'paid_creative_reference',
          trendId: undefined,
        },
      );
    });

    it('rejects unknown source classification filters', async () => {
      await expect(
        discoveryController.getReferenceCorpus(
          mockUser,
          undefined,
          undefined,
          undefined,
          'unknown_kind',
          undefined,
          undefined,
          '10',
        ),
      ).rejects.toThrow('Unknown trend source kind: unknown_kind');
    });
  });

  describe('getPromptReferencePacks', () => {
    it('should return prompt-ready packs scoped by platform, intent, and type', async () => {
      mockTrendsService.getPromptReferencePacks.mockResolvedValue({
        packs: [
          {
            confidence: 'medium',
            constraints: [],
            contentIntent: 'organic_trend_discovery',
            examples: ['Hook angle: AI tools clip'],
            freshness: {
              expiredSourceIds: [],
              freshnessWindowDays: 2,
              regenerateAfter: '2026-06-14T00:00:00.000Z',
              staleSourceIds: [],
              status: 'fresh',
            },
            id: 'prompt-pack:hooks:tiktok:abc123',
            instructions: [],
            metadata: {
              contentTypes: ['video'],
              generatedAt: '2026-06-13T00:00:00.000Z',
              matchedTopics: ['ai tools'],
              sourceCount: 1,
              sourceKinds: ['public_platform_reference'],
            },
            regeneration: {
              cacheKey: 'abc123',
              sourceFingerprint: 'ref_tiktok',
              trigger: 'cache_key_changed',
            },
            sourceReferenceIds: ['ref_tiktok'],
            sources: [],
            summary: 'Reusable hook patterns from 1 reference.',
            targetPlatform: 'tiktok',
            title: 'Hooks pack from tiktok',
            type: 'hooks',
          },
        ],
        summary: {
          availableTypes: ['hooks'],
          contentIntent: 'organic_trend_discovery',
          generatedAt: '2026-06-13T00:00:00.000Z',
          skippedSources: 0,
          targetPlatform: 'tiktok',
          totalPacks: 1,
          totalSources: 1,
        },
      });

      const result = await discoveryController.getPromptReferencePacks(
        mockUser,
        'tiktok',
        'organic_trend_discovery',
        'hooks,unsupported',
        '8',
      );

      expect(trendsService.getPromptReferencePacks).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        {
          intent: 'organic_trend_discovery',
          limit: 8,
          platform: 'tiktok',
          types: ['hooks'],
        },
      );
      expect(result).toEqual(
        expect.objectContaining({
          packs: [
            expect.objectContaining({
              id: 'prompt-pack:hooks:tiktok:abc123',
              type: 'hooks',
            }),
          ],
          summary: expect.objectContaining({
            totalPacks: 1,
          }),
        }),
      );
    });
  });

  describe('getTopReferenceAccounts', () => {
    it('should return ranked accounts for remix research', async () => {
      mockTrendsService.getTopReferenceAccounts.mockResolvedValue({
        accounts: [
          {
            authorHandle: 'builder',
            avgTrendViralityScore: 77,
            brandRemixCount: 4,
            platform: 'twitter',
            referenceCount: 6,
            totalEngagement: 8000,
          },
        ],
        totalAccounts: 1,
      });

      const result = await discoveryController.getTopReferenceAccounts(
        mockUser,
        'twitter',
        '8',
      );

      expect(trendsService.getTopReferenceAccounts).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        {
          limit: 8,
          platform: 'twitter',
        },
      );
      expect(result).toEqual({
        accounts: [
          expect.objectContaining({
            authorHandle: 'builder',
          }),
        ],
        summary: {
          totalAccounts: 1,
        },
      });
    });
  });

  describe('getCorpusFreshnessHealth', () => {
    it('should return corpus freshness health with platform filters', async () => {
      const health = {
        generatedAt: '2026-06-30T08:00:00.000Z',
        providerFailures: [],
        segments: [],
        status: 'healthy',
        summary: {
          activeTrends: 4,
          failingProviders: 0,
          freshSegments: 2,
          platforms: ['tiktok'],
          referenceRecords: 12,
          staleSegments: 0,
          totalSegments: 2,
        },
        thresholds: {
          defaultFreshnessWindowDaysBySourceKind: {
            manual_curated_reference: 30,
            owned_brand_reference: 30,
            paid_creative_reference: 14,
            public_platform_reference: 7,
          },
          recordLimits: {
            referenceRecords: 5000,
            trends: 2000,
          },
          sourcePreviewStaleAfterDays: 3,
        },
      };
      mockTrendsService.getCorpusFreshnessHealth.mockResolvedValue(health);

      const result = await discoveryController.getCorpusFreshnessHealth(
        mockUser,
        'tiktok',
      );

      expect(trendsService.getCorpusFreshnessHealth).toHaveBeenCalledWith({
        isPlatformAdmin: false,
        organizationId: mockUser.organizationId,
        platform: 'tiktok',
      });
      expect(result).toEqual(health);
    });

    it('requests the global cross-org view for platform admins', async () => {
      mockTrendsService.getCorpusFreshnessHealth.mockResolvedValue({
        generatedAt: '2026-06-30T08:00:00.000Z',
        providerFailures: [],
        segments: [],
        status: 'healthy',
        summary: {},
      });
      const adminUser = {
        id: 'admin_1',
        isSuperAdmin: true,
        organizationId: testId('org'),
      } as unknown as User;

      await discoveryController.getCorpusFreshnessHealth(adminUser, undefined);

      expect(trendsService.getCorpusFreshnessHealth).toHaveBeenCalledWith({
        isPlatformAdmin: true,
        organizationId: adminUser.organizationId,
        platform: undefined,
      });
    });
  });

  describe('getTrendIdeas', () => {
    it('should generate content ideas from trends', async () => {
      const query: GenerateTrendIdeasDto = {
        limit: 10,
        platform: 'twitter',
      };

      const mockIdeasMap = new Map([
        [
          'twitter',
          [
            {
              description: 'Content idea based on trending topic',
              title: 'AI Development in 2025',
            },
          ],
        ],
      ]);

      mockTrendsService.getTrends.mockResolvedValue([mockTrend]);
      mockTrendsService.generateContentIdeas.mockResolvedValue(mockIdeasMap);

      const result = await controller.getTrendIdeas(mockReq, mockUser, query);

      expect(trendsService.getTrends).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
        query.platform,
        {
          allowFetchIfMissing: false,
        },
      );
      expect(trendsService.generateContentIdeas).toHaveBeenCalledWith(
        [mockTrend],
        query.limit,
        expect.any(Function),
      );
      expect(result.success).toBe(true);
      expect(result.ideas).toBeDefined();
    });
  });

  describe('refreshTrends', () => {
    it('should refresh trends successfully', async () => {
      mockTrendsService.refreshTrends.mockResolvedValue([mockTrend]);

      const result = await controller.refreshTrends(mockUser);

      expect(trendsService.refreshTrends).toHaveBeenCalledWith(
        mockUser.organizationId,
        mockUser.brandId,
      );
      expect(result).toEqual({
        count: 1,
        message: 'Trends refreshed successfully',
        success: true,
      });
    });

    it('should handle errors when refreshing trends', async () => {
      mockTrendsService.refreshTrends.mockRejectedValue(new Error('API error'));

      await expect(controller.refreshTrends(mockUser)).rejects.toThrow(
        'API error',
      );
    });
  });

  describe('getTrendSources', () => {
    it('should return source items for a trend', async () => {
      mockTrendsService.getTrendSourceItems.mockResolvedValue([
        {
          contentType: 'video',
          id: 'source-1',
          platform: 'instagram',
          sourceUrl: 'https://instagram.com/p/test',
        },
      ]);

      const result = await controller.getTrendSources(mockUser, 'trend-1', '3');

      expect(trendsService.getTrendSourceItems).toHaveBeenCalledWith(
        'trend-1',
        mockUser.organizationId,
        3,
      );
      expect(result).toEqual({
        items: [
          {
            contentType: 'video',
            id: 'source-1',
            platform: 'instagram',
            sourceUrl: 'https://instagram.com/p/test',
          },
        ],
      });
    });
  });
});
