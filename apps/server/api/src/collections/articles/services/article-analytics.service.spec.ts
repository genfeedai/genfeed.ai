vi.mock('@api/collections/articles/services/articles.service', () => ({
  ArticlesService: class {},
}));

import type { ArticleEntity } from '@api/collections/articles/entities/article.entity';
import { ArticleAnalyticsEntity } from '@api/collections/articles/entities/article-analytics.entity';
import {
  ArticleAnalytics,
  type ArticleAnalyticsDocument,
} from '@api/collections/articles/schemas/article-analytics.schema';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type Article } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('ArticleAnalyticsService', () => {
  let service: ArticleAnalyticsService;
  let mockModel: vi.Mocked<any>;
  let mockArticleModel: vi.Mocked<any>;
  let mockLogger: vi.Mocked<LoggerService>;

  const mockArticleId = 'test-object-id'.toHexString();
  const mockUserId = 'test-object-id';
  const mockOrgId = 'test-object-id';
  const mockBrandId = 'test-object-id';

  const createMockAnalyticsDoc = (
    overrides: Partial<ArticleAnalyticsDocument> = {},
  ) => ({
    _id: 'test-object-id',
    article: new string(mockArticleId),
    brand: mockBrandId,
    clickThroughRate: 2.5,
    date: new Date(),
    engagementRate: 18,
    isDeleted: false,
    organization: mockOrgId,
    toObject: vi.fn().mockReturnThis(),
    totalComments: 5,
    totalCommentsIncrement: 1,
    totalLikes: 10,
    totalLikesIncrement: 2,
    totalShares: 3,
    totalSharesIncrement: 1,
    totalViews: 100,
    totalViewsIncrement: 10,
    user: mockUserId,
    ...overrides,
  });

  const createMockArticle = () => ({
    _id: new string(mockArticleId),
    brand: mockBrandId,
    isDeleted: false,
    organization: mockOrgId,
    title: 'Test Article',
    user: mockUserId,
  });

  beforeEach(async () => {
    const mockFindOneAndUpdate = vi.fn();
    const mockFind = vi.fn();
    const mockAggregate = vi.fn();

    mockModel = {
      aggregate: mockAggregate,
      find: mockFind,
      findOne: vi.fn(),
      findOneAndUpdate: mockFindOneAndUpdate,
    };

    mockArticleModel = {
      findOne: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticleAnalyticsService,
        {
          provide: PrismaService,
          useValue: { ...mockModel, ...mockArticleModel, ...mockModel },
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    const serviceWithoutArticleModel =
      moduleWithoutArticleModel.get<ArticleAnalyticsService>(
        ArticleAnalyticsService,
      );

    vi.spyOn(serviceWithoutArticleModel as any, 'findOne').mockResolvedValue(
      null,
    );

    await expect(
      serviceWithoutArticleModel.updateTodayAnalytics(mockArticleId, {
        totalViews: 100,
      }),
    ).rejects.toThrow('Article model not available');
  });

  it('should throw NotFoundException if article not found', async () => {
    vi.spyOn(service as any, 'findOne').mockResolvedValue(null);
    mockArticleModel.findOne.mockResolvedValue(null);

    await expect(
      service.updateTodayAnalytics(mockArticleId, { totalViews: 100 }),
    ).rejects.toThrow(NotFoundException);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('not found for analytics update'),
    );
  });

  it('should calculate engagement rate correctly', async () => {
    vi.spyOn(service as any, 'findOne').mockResolvedValue(null);

    const mockArticle = createMockArticle();
    mockArticleModel.findOne.mockResolvedValue(
      mockArticle as unknown as ArticleEntity,
    );

    const updatedDoc = createMockAnalyticsDoc({
      engagementRate: 20, // (10+5+5)/100 * 100 = 20%
      totalComments: 5,
      totalLikes: 10,
      totalShares: 5,
      totalViews: 100,
    });

    mockModel.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(updatedDoc),
    });

    const result = await service.updateTodayAnalytics(mockArticleId, {
      totalComments: 5,
      totalLikes: 10,
      totalShares: 5,
      totalViews: 100,
    });

    expect(result).not.toBeNull();
  });

  it('should return null when findOneAndUpdate returns null', async () => {
    vi.spyOn(service as any, 'findOne').mockResolvedValue(null);

    const mockArticle = createMockArticle();
    mockArticleModel.findOne.mockResolvedValue(
      mockArticle as unknown as ArticleEntity,
    );

    mockModel.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    });

    const result = await service.updateTodayAnalytics(mockArticleId, {
      totalViews: 100,
    });

    expect(result).toBeNull();
  });

  it('should handle zero views for engagement rate calculation', async () => {
    vi.spyOn(service as any, 'findOne').mockResolvedValue(null);

    const mockArticle = createMockArticle();
    mockArticleModel.findOne.mockResolvedValue(
      mockArticle as unknown as ArticleEntity,
    );

    const updatedDoc = createMockAnalyticsDoc({
      engagementRate: 0,
      totalViews: 0,
    });

    mockModel.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(updatedDoc),
    });

    const _result = await service.updateTodayAnalytics(mockArticleId, {
      totalLikes: 5,
      totalViews: 0,
    });

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          engagementRate: 0,
        }),
      }),
      expect.anything(),
    );
  });
});

describe('getArticleAnalyticsSummary', () => {
  it('should return aggregated analytics summary', async () => {
    const aggregateResult = [
      {
        avgClickThroughRate: 2.8,
        avgEngagementRate: 18.5,
        lastUpdated: new Date(),
        totalComments: 25,
        totalLikes: 50,
        totalShares: 15,
        totalViews: 500,
      },
    ];

    mockModel.aggregate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(aggregateResult),
    });

    const result = await service.getArticleAnalyticsSummary(mockArticleId);

    expect(result).toEqual({
      avgClickThroughRate: 2.8,
      avgEngagementRate: 18.5,
      lastUpdated: expect.any(Date),
      totalComments: 25,
      totalLikes: 50,
      totalShares: 15,
      totalViews: 500,
    });

    expect(mockModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            article: expect.any(string),
            isDeleted: false,
          }),
        }),
      ]),
    );
  });

  it('should return zeros when no analytics exist', async () => {
    mockModel.aggregate.mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    });

    const result = await service.getArticleAnalyticsSummary(mockArticleId);

    expect(result).toEqual({
      avgClickThroughRate: 0,
      avgEngagementRate: 0,
      totalComments: 0,
      totalLikes: 0,
      totalShares: 0,
      totalViews: 0,
    });
  });

  it('should handle null values in aggregation result', async () => {
    const aggregateResult = [
      {
        avgClickThroughRate: null,
        avgEngagementRate: undefined,
        lastUpdated: new Date(),
        totalComments: 0,
        totalLikes: undefined,
        totalShares: null,
        totalViews: null,
      },
    ];

    mockModel.aggregate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(aggregateResult),
    });

    const result = await service.getArticleAnalyticsSummary(mockArticleId);

    expect(result.totalViews).toBe(0);
    expect(result.totalLikes).toBe(0);
    expect(result.totalComments).toBe(0);
    expect(result.totalShares).toBe(0);
    expect(result.avgEngagementRate).toBe(0);
    expect(result.avgClickThroughRate).toBe(0);
  });
});

describe('getAnalyticsByDateRange', () => {
  it('should return analytics within date range', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    const mockDocs = [
      createMockAnalyticsDoc({ date: new Date('2024-01-15') }),
      createMockAnalyticsDoc({ date: new Date('2024-01-10') }),
    ];

    mockModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDocs),
      }),
    });

    const result = await service.getAnalyticsByDateRange(
      mockArticleId,
      startDate,
      endDate,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(ArticleAnalyticsEntity);

    expect(mockModel.find).toHaveBeenCalledWith({
      article: expect.any(string),
      date: expect.objectContaining({
        $gte: expect.any(Date),
        $lte: expect.any(Date),
      }),
      isDeleted: false,
    });
  });

  it('should return empty array when no analytics in range', async () => {
    mockModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await service.getAnalyticsByDateRange(
      mockArticleId,
      new Date('2024-01-01'),
      new Date('2024-01-31'),
    );

    expect(result).toEqual([]);
  });
});

describe('updatePerformanceMetrics', () => {
  it('should call updateTodayAnalytics with mapped metrics', async () => {
    const updateSpy = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.updatePerformanceMetrics(mockArticleId, {
      clickThroughRate: 2.5,
      comments: 5,
      likes: 10,
      shares: 3,
      views: 100,
    });

    expect(updateSpy).toHaveBeenCalledWith(mockArticleId, {
      clickThroughRate: 2.5,
      totalComments: 5,
      totalLikes: 10,
      totalShares: 3,
      totalViews: 100,
    });
  });

  it('should handle partial metrics update', async () => {
    const updateSpy = vi
      .spyOn(service, 'updateTodayAnalytics')
      .mockResolvedValue(null);

    await service.updatePerformanceMetrics(mockArticleId, {
      views: 50,
    });

    expect(updateSpy).toHaveBeenCalledWith(mockArticleId, {
      clickThroughRate: undefined,
      totalComments: undefined,
      totalLikes: undefined,
      totalShares: undefined,
      totalViews: 50,
    });
  });
});
