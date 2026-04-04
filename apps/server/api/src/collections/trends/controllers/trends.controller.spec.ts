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

import { TrendsController } from '@api/collections/trends/controllers/trends.controller';
import { GenerateTrendIdeasDto } from '@api/collections/trends/dto/trend-ideas.dto';
import { TrendsService } from '@api/collections/trends/services/trends.service';
import type { User } from '@clerk/backend';
import type { Request } from 'express';

describe('TrendsController', () => {
  let controller: TrendsController;
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
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockReq = {} as Request;

  const mockTrendsService = {
    fetchAndCacheHashtags: vi.fn(),
    fetchAndCacheSounds: vi.fn(),
    fetchAndCacheViralVideos: vi.fn(),
    generateContentIdeas: vi.fn(),
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
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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

      const result = await controller.getTrendsDiscovery(
        mockUser,
        'twitter',
        undefined,
      );

      expect(trendsService.getTrendsDiscovery).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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

      await controller.getTrendsDiscovery(mockUser, undefined, 'true');

      expect(trendsService.refreshTrends).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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

      const result = await controller.getTrendContent(
        mockUser,
        'twitter',
        '12',
        undefined,
      );

      expect(trendsService.getTrendContent).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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

      await controller.getTrendContent(mockUser, undefined, undefined, 'true');

      expect(trendsService.getTrendContent).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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
            sourcePreviewState: 'live',
          },
        ],
        totalReferences: 1,
      });

      const result = await controller.getReferenceCorpus(
        mockUser,
        'twitter',
        'trend-1',
        'builder',
        '15',
      );

      expect(trendsService.getReferenceCorpus).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
        {
          authorHandle: 'builder',
          limit: 15,
          platform: 'twitter',
          trendId: 'trend-1',
        },
      );
      expect(result).toEqual({
        items: [
          expect.objectContaining({
            id: 'ref-1',
          }),
        ],
        summary: {
          totalReferences: 1,
        },
      });
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

      const result = await controller.getTopReferenceAccounts(
        mockUser,
        'twitter',
        '8',
      );

      expect(trendsService.getTopReferenceAccounts).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
        query.platform,
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
        mockUser.publicMetadata.organization,
        mockUser.publicMetadata.brand,
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
        mockUser.publicMetadata.organization,
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
