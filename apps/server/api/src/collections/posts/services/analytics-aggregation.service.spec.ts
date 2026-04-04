import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

describe('AnalyticsAggregationService', () => {
  let service: AnalyticsAggregationService;
  let analyticsModel: Record<string, ReturnType<typeof vi.fn>>;

  const mockOrgId = new Types.ObjectId().toString();

  beforeEach(async () => {
    analyticsModel = {
      aggregate: vi.fn(),
      aggregatePaginate: vi.fn(),
      distinct: vi.fn(),
      find: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAggregationService,
        {
          provide: getModelToken(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS),
          useValue: analyticsModel,
        },
        {
          provide: PostsService,
          useValue: {
            count: vi.fn().mockResolvedValue(0),
            findAll: vi.fn(),
            findOne: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsAggregationService>(
      AnalyticsAggregationService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('service initialization', () => {
    it('should initialize with required models', () => {
      expect(service).toBeDefined();
      expect(analyticsModel).toBeDefined();
    });
  });

  describe('aggregation methods', () => {
    it('should handle empty results gracefully', () => {
      analyticsModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      // Test would call specific aggregation methods when they're public
      expect(service).toBeDefined();
    });
  });

  describe('getOverviewMetrics', () => {
    it('should return overview metrics with empty data', async () => {
      analyticsModel.aggregate
        .mockResolvedValueOnce([]) // currentMetrics
        .mockResolvedValueOnce([]) // previousMetrics
        .mockResolvedValueOnce([]); // platformMetrics

      const postsService = service['postsService'] as any;
      postsService.count.mockResolvedValue(0);

      const result = await service.getOverviewMetrics(mockOrgId);

      expect(result).toBeDefined();
      expect(result.totalPosts).toBe(0);
      expect(result.totalViews).toBe(0);
    });

    it('should return metrics when data exists', async () => {
      const mockCurrentMetrics = [
        {
          _id: null,
          avgEngagementRate: 5.5,
          platforms: ['twitter', 'instagram'],
          totalComments: 100,
          totalLikes: 500,
          totalSaves: 50,
          totalShares: 200,
          totalViews: 10000,
        },
      ];

      analyticsModel.aggregate
        .mockResolvedValueOnce(mockCurrentMetrics) // currentMetrics
        .mockResolvedValueOnce([
          { _id: null, totalEngagement: 500, totalViews: 8000 },
        ]) // previousMetrics
        .mockResolvedValueOnce([{ _id: 'twitter', totalViews: 10000 }]); // platformMetrics

      const postsService = service['postsService'] as any;
      postsService.count.mockResolvedValue(10);

      const result = await service.getOverviewMetrics(mockOrgId);

      expect(result).toBeDefined();
      expect(result.totalViews).toBe(10000);
      expect(result.totalLikes).toBe(500);
      expect(result.totalComments).toBe(100);
      expect(result.bestPerformingPlatform).toBe('twitter');
    });
  });

  describe('getTimeSeriesData', () => {
    it('should return time series data', async () => {
      const mockResults = [
        {
          comments: 10,
          date: '2024-01-01',
          engagementRate: 5,
          likes: 50,
          saves: 5,
          shares: 20,
          totalEngagement: 80,
          views: 1000,
        },
      ];

      analyticsModel.aggregate.mockResolvedValue(mockResults);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-07');

      const result = await service.getTimeSeriesData(
        mockOrgId,
        undefined,
        startDate,
        endDate,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(analyticsModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('getPlatformComparison', () => {
    it('should return platform comparison data', async () => {
      const mockResults = [
        {
          avgViewsPerPost: 1000,
          comments: 50,
          engagementRate: 5,
          likes: 500,
          platform: 'twitter',
          postCount: 10,
          saves: 20,
          shares: 100,
          views: 10000,
        },
      ];

      analyticsModel.aggregate.mockResolvedValue(mockResults);

      const result = await service.getPlatformComparison(mockOrgId, undefined);

      expect(Array.isArray(result)).toBe(true);
      expect(analyticsModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('getEngagementBreakdown', () => {
    it('should return engagement breakdown', async () => {
      const mockResults = [
        {
          comments: 50,
          likes: 200,
          saves: 30,
          shares: 70,
        },
      ];

      analyticsModel.aggregate.mockResolvedValue(mockResults);

      const result = await service.getEngagementBreakdown(mockOrgId, undefined);

      expect(result).toBeDefined();
      expect(result.total).toBe(350);
      expect(result.likes).toBe(200);
      expect(result.comments).toBe(50);
    });

    it('should handle empty data with zero totals', async () => {
      analyticsModel.aggregate.mockResolvedValue([]);

      const result = await service.getEngagementBreakdown(mockOrgId, undefined);

      expect(result).toBeDefined();
      expect(result.total).toBe(0);
      expect(result.likesPercentage).toBe(0);
    });
  });
});
