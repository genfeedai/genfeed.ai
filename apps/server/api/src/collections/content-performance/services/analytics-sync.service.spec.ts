import {
  ContentPerformance,
  PerformanceSource,
} from '@api/collections/content-performance/schemas/content-performance.schema';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { Post } from '@api/collections/posts/schemas/post.schema';
import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { vi } from 'vitest';

describe('AnalyticsSyncService', () => {
  let service: AnalyticsSyncService;
  let mockContentPerformanceModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockPostAnalyticsModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockPostModel: Record<string, ReturnType<typeof vi.fn>>;
  let mockBrandMemorySyncService: {
    detectThresholdAlerts: ReturnType<typeof vi.fn>;
    syncPostPerformance: ReturnType<typeof vi.fn>;
  };
  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const postId = new Types.ObjectId();
  const userId = new Types.ObjectId();

  beforeEach(async () => {
    mockContentPerformanceModel = {
      findOne: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue(null),
          }),
        }),
      }),
      findOneAndUpdate: vi.fn().mockResolvedValue({ _id: 'updated' }),
    };

    mockPostAnalyticsModel = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      }),
    };

    mockPostModel = {
      find: vi.fn().mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      }),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    mockBrandMemorySyncService = {
      detectThresholdAlerts: vi.fn().mockResolvedValue([]),
      syncPostPerformance: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AnalyticsSyncService,
        {
          provide: getModelToken(ContentPerformance.name, DB_CONNECTIONS.CLOUD),
          useValue: mockContentPerformanceModel,
        },
        {
          provide: getModelToken(PostAnalytics.name, DB_CONNECTIONS.ANALYTICS),
          useValue: mockPostAnalyticsModel,
        },
        {
          provide: getModelToken(Post.name, DB_CONNECTIONS.CLOUD),
          useValue: mockPostModel,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: BrandMemorySyncService,
          useValue: mockBrandMemorySyncService,
        },
      ],
    }).compile();

    service = module.get(AnalyticsSyncService);
  });

  describe('syncAnalytics', () => {
    it('should return zero counts when no analytics exist', async () => {
      const result = await service.syncAnalytics({
        organizationId: orgId,
      });

      expect(result.synced).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.organizationId).toBe(orgId);
    });

    it('should sync analytics and upsert into content performance', async () => {
      const analyticsData = [
        {
          _id: new Types.ObjectId(),
          brand: new Types.ObjectId(brandId),
          date: new Date(),
          platform: 'instagram',
          post: postId,
          totalComments: 5,
          totalLikes: 100,
          totalSaves: 10,
          totalShares: 20,
          totalViews: 1000,
          user: userId,
        },
      ];

      const postData = [
        {
          _id: postId,
          brand: new Types.ObjectId(brandId),
          category: 'image',
          externalId: 'ext-123',
          generationId: 'wf-123-node-1',
          promptUsed: 'test prompt',
        },
      ];

      mockPostAnalyticsModel.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue(analyticsData),
              }),
            }),
          }),
        }),
      });

      // Second call returns empty (end of batches)
      mockPostAnalyticsModel.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      mockPostModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(postData),
        }),
      });

      const result = await service.syncAnalytics({
        organizationId: orgId,
      });

      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);
      expect(mockContentPerformanceModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          post: postId,
          source: PerformanceSource.API,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            comments: 5,
            generationId: 'wf-123-node-1',
            likes: 100,
            saves: 10,
            shares: 20,
            views: 1000,
          }),
        }),
        { new: true, upsert: true },
      );
      expect(mockBrandMemorySyncService.syncPostPerformance).toHaveBeenCalled();
    });

    it('should handle errors gracefully and continue processing', async () => {
      const analyticsData = [
        {
          _id: new Types.ObjectId(),
          brand: new Types.ObjectId(brandId),
          date: new Date(),
          platform: 'instagram',
          post: postId,
          totalComments: 5,
          totalLikes: 100,
          totalSaves: 10,
          totalShares: 20,
          totalViews: 1000,
          user: userId,
        },
      ];

      mockPostAnalyticsModel.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue(analyticsData),
              }),
            }),
          }),
        }),
      });

      mockPostAnalyticsModel.find.mockReturnValueOnce({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockReturnValue({
                exec: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
        }),
      });

      mockPostModel.find.mockReturnValue({
        lean: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue([]),
        }),
      });

      mockContentPerformanceModel.findOneAndUpdate.mockRejectedValueOnce(
        new Error('DB error'),
      );

      const result = await service.syncAnalytics({
        organizationId: orgId,
      });

      expect(result.errors).toBe(1);
      expect(result.synced).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should apply since filter when provided', async () => {
      const since = new Date('2026-01-01');

      await service.syncAnalytics({
        organizationId: orgId,
        since,
      });

      expect(mockPostAnalyticsModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          date: { $gte: since },
        }),
      );
    });

    it('should filter by brand when provided', async () => {
      await service.syncAnalytics({
        brandId,
        organizationId: orgId,
      });

      expect(mockPostAnalyticsModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: new Types.ObjectId(brandId),
        }),
      );
    });
  });

  describe('getLastSyncDate', () => {
    it('should return null when no synced records exist', async () => {
      const result = await service.getLastSyncDate(orgId);
      expect(result).toBeNull();
    });

    it('should return the latest measuredAt date', async () => {
      const date = new Date('2026-02-15');
      mockContentPerformanceModel.findOne.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({ measuredAt: date }),
          }),
        }),
      });

      const result = await service.getLastSyncDate(orgId);
      expect(result).toEqual(date);
    });
  });
});
