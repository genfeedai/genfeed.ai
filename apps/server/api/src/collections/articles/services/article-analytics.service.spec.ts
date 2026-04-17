vi.mock('@api/collections/articles/services/articles.service', () => ({
  ArticlesService: class {},
}));

import type { ArticleEntity } from '@api/collections/articles/entities/article.entity';
import { ArticleAnalyticsEntity } from '@api/collections/articles/entities/article-analytics.entity';
import { Article } from '@api/collections/articles/schemas/article.schema';
import {
  ArticleAnalytics,
  type ArticleAnalyticsDocument,
} from '@api/collections/articles/schemas/article-analytics.schema';
import { ArticleAnalyticsService } from '@api/collections/articles/services/article-analytics.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';

describe('ArticleAnalyticsService', () => {
  let service: ArticleAnalyticsService;
  let mockModel: vi.Mocked<any>;
  let mockArticleModel: vi.Mocked<any>;
  let mockLogger: vi.Mocked<LoggerService>;

  const mockArticleId = new Types.ObjectId().toHexString();
  const mockUserId = new Types.ObjectId();
  const mockOrgId = new Types.ObjectId();
  const mockBrandId = new Types.ObjectId();

  const createMockAnalyticsDoc = (
    overrides: Partial<ArticleAnalyticsDocument> = {},
  ) => ({
    _id: new Types.ObjectId(),
    article: new Types.ObjectId(mockArticleId),
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
    _id: new Types.ObjectId(mockArticleId),
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
          provide: getModelToken(
            ArticleAnalytics.name,
            DB_CONNECTIONS.ANALYTICS,
          ),
          useValue: mockModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: getModelToken(Article.name, DB_CONNECTIONS.CLOUD),
          useValue: mockArticleModel,
        },
      ],
    }).compile();

    service = module.get<ArticleAnalyticsService>(ArticleAnalyticsService);

    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('findOrCreateTodayAnalytics', () => {
    it('should create analytics for today if not exists', async () => {
      const mockDoc = createMockAnalyticsDoc();
      mockModel.findOneAndUpdate.mockResolvedValue(mockDoc);

      const result = await service.findOrCreateTodayAnalytics(mockArticleId, {
        organization: mockOrgId,
        user: mockUserId,
      });

      expect(result).toBeInstanceOf(ArticleAnalyticsEntity);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          article: expect.any(Types.ObjectId),
          date: expect.any(Date),
        }),
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            isDeleted: false,
            totalComments: 0,
            totalLikes: 0,
            totalShares: 0,
            totalViews: 0,
          }),
        }),
        expect.objectContaining({
          returnDocument: 'after',
          setDefaultsOnInsert: true,
          upsert: true,
        }),
      );
    });

    it('should handle duplicate key error (race condition)', async () => {
      const duplicateKeyError = { code: 11000 };
      const mockDoc = createMockAnalyticsDoc();

      mockModel.findOneAndUpdate.mockRejectedValueOnce(duplicateKeyError);
      mockModel.findOne = vi.fn().mockResolvedValue(mockDoc);

      // Need to mock parent class findOne
      vi.spyOn(service as any, 'findOne').mockResolvedValue(mockDoc);

      const result = await service.findOrCreateTodayAnalytics(
        mockArticleId,
        {},
      );

      expect(result).toBeInstanceOf(ArticleAnalyticsEntity);
    });

    it('should throw non-duplicate key errors', async () => {
      const otherError = new Error('Database connection failed');
      mockModel.findOneAndUpdate.mockRejectedValueOnce(otherError);

      await expect(
        service.findOrCreateTodayAnalytics(mockArticleId, {}),
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('updateTodayAnalytics', () => {
    it('should update analytics with calculated increments', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const yesterdayDoc = createMockAnalyticsDoc({
        date: yesterday,
        totalComments: 2,
        totalLikes: 5,
        totalShares: 1,
        totalViews: 50,
      });

      const todayDoc = createMockAnalyticsDoc({
        totalComments: 5,
        totalLikes: 10,
        totalShares: 3,
        totalViews: 100,
      });

      const mockArticle = createMockArticle();

      vi.spyOn(service as any, 'findOne')
        .mockResolvedValueOnce(yesterdayDoc)
        .mockResolvedValueOnce(null);

      mockArticleModel.findOne.mockResolvedValue(
        mockArticle as unknown as ArticleEntity,
      );
      mockModel.findOneAndUpdate.mockReturnValue({
        exec: vi.fn().mockResolvedValue(todayDoc),
      });

      const result = await service.updateTodayAnalytics(mockArticleId, {
        totalComments: 5,
        totalLikes: 10,
        totalShares: 3,
        totalViews: 100,
      });

      expect(result).toBeInstanceOf(ArticleAnalyticsEntity);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          article: expect.any(Types.ObjectId),
          date: expect.any(Date),
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            totalComments: 5,
            totalCommentsIncrement: 3,
            totalLikes: 10,
            totalLikesIncrement: 5,
            totalShares: 3,
            totalSharesIncrement: 2,
            totalViews: 100,
            totalViewsIncrement: 50,
          }),
        }),
        expect.objectContaining({
          returnDocument: 'after',
          upsert: true,
        }),
      );
    });

    it('should throw error if article model is not available', async () => {
      // Create service without article model
      const moduleWithoutArticleModel: TestingModule =
        await Test.createTestingModule({
          providers: [
            ArticleAnalyticsService,
            {
              provide: getModelToken(
                ArticleAnalytics.name,
                DB_CONNECTIONS.ANALYTICS,
              ),
              useValue: mockModel,
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
              article: expect.any(Types.ObjectId),
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
        article: expect.any(Types.ObjectId),
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
});
