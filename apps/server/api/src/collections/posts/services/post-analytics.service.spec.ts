import { CreatePostAnalyticsDto } from '@api/collections/posts/dto/create-post-analytics.dto';
import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostAnalyticsService', () => {
  let service: PostAnalyticsService;
  let mockModel: {
    aggregate: ReturnType<typeof vi.fn>;
    aggregatePaginate: ReturnType<typeof vi.fn>;
    collection: { name: string };
    create: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByIdAndDelete: ReturnType<typeof vi.fn>;
    findByIdAndUpdate: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    lean: ReturnType<typeof vi.fn>;
    modelName: string;
    populate: ReturnType<typeof vi.fn>;
  };

  const mockPostId = 'test-object-id'.toString();
  const mockPlatform = CredentialPlatform.TWITTER;

  const mockAnalytics = {
    _id: 'test-object-id',
    date: new Date('2024-01-01'),
    engagementRate: 17,
    platform: mockPlatform,
    post: new string(mockPostId),
    totalComments: 5,
    totalCommentsIncrement: 1,
    totalLikes: 10,
    totalLikesIncrement: 2,
    totalSaves: 1,
    totalShares: 2,
    totalViews: 100,
    totalViewsIncrement: 10,
  };

  beforeEach(async () => {
    mockModel = {
      aggregate: vi.fn(),
      aggregatePaginate: vi.fn(),
      collection: { name: 'post-analytics' },
      create: vi.fn(),
      exec: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      lean: vi.fn(),
      modelName: 'PostAnalytics',
      populate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostAnalyticsService,
        { provide: PrismaService, useValue: mockModel },
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
          provide: PostsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              _id: 'test-object-id',
              brand: 'test-object-id',
              ingredients: ['test-object-id'],
              organization: 'test-object-id',
              user: 'test-object-id',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PostAnalyticsService>(PostAnalyticsService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreateTodayAnalytics', () => {
    it('should return existing analytics if found via upsert', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockModel.findOneAndUpdate.mockResolvedValue(mockAnalytics);

      const data: Partial<CreatePostAnalyticsDto> = {
        totalLikes: 10,
        totalViews: 100,
      };

      const result = await service.findOrCreateTodayAnalytics(
        mockPostId,
        mockPlatform,
        data,
      );

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          date: today,
          platform: mockPlatform,
          post: new string(mockPostId),
        },
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            isDeleted: false,
            platform: mockPlatform,
            post: new string(mockPostId),
            totalComments: 0,
            totalLikes: 0,
            totalShares: 0,
            totalViews: 0,
          }),
        }),
        {
          returnDocument: 'after',
          setDefaultsOnInsert: true,
          upsert: true,
        },
      );
      expect(result).toBeDefined();
    });

    it('should handle race condition with duplicate key error', async () => {
      const duplicateKeyError: any = new Error('Duplicate key error');
      duplicateKeyError.code = 11000;
      mockModel.findOneAndUpdate.mockRejectedValue(duplicateKeyError);

      const existingAnalytics = { ...mockAnalytics };
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingAnalytics),
      });

      const data: Partial<CreatePostAnalyticsDto> = {
        totalLikes: 10,
        totalViews: 100,
      };

      const result = await service.findOrCreateTodayAnalytics(
        mockPostId,
        mockPlatform,
        data,
      );

      expect(result).toBeDefined();
    });

    it('should throw non-duplicate-key errors', async () => {
      const otherError = new Error('Database connection failed');
      mockModel.findOneAndUpdate.mockRejectedValue(otherError);

      await expect(
        service.findOrCreateTodayAnalytics(mockPostId, mockPlatform, {}),
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('updateTodayAnalytics', () => {
    it('should update analytics with increments from yesterday', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const yesterdayAnalytics = {
        ...mockAnalytics,
        date: yesterday,
        totalComments: 4,
        totalLikes: 8,
        totalSaves: 0,
        totalShares: 1,
        totalViews: 90,
      };

      const todayAnalytics = {
        ...mockAnalytics,
        _id: 'test-object-id',
        date: today,
      };

      // BaseService.findOne calls model.findOne().exec() — two findOne calls: yesterday then today
      mockModel.findOne
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue(yesterdayAnalytics),
        })
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue(todayAnalytics),
        });

      // updateTodayAnalytics calls postsService.findOne then model.findOneAndUpdate().exec()
      mockModel.findOneAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...todayAnalytics,
          engagementRate: 17,
          totalComments: 5,
          totalCommentsIncrement: 1,
          totalLikes: 10,
          totalLikesIncrement: 2,
          totalSaves: 1,
          totalSavesIncrement: 1,
          totalShares: 2,
          totalSharesIncrement: 1,
          totalViews: 100,
          totalViewsIncrement: 10,
        }),
      });

      const metrics = {
        totalComments: 5,
        totalLikes: 10,
        totalSaves: 1,
        totalShares: 2,
        totalViews: 100,
      };

      const result = await service.updateTodayAnalytics(
        mockPostId,
        mockPlatform,
        metrics,
      );

      expect(result).toBeDefined();
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          date: today,
          platform: mockPlatform,
          post: new string(mockPostId),
        },
        expect.objectContaining({
          $set: expect.objectContaining({
            engagementRate: 17,
            totalComments: 5,
            totalCommentsIncrement: 1,
            totalLikes: 10,
            totalLikesIncrement: 2,
            totalSaves: 1,
            totalSavesIncrement: 1,
            totalShares: 2,
            totalSharesIncrement: 1,
            totalViews: 100,
            totalViewsIncrement: 10,
          }),
        }),
        { returnDocument: 'after', upsert: true },
      );
    });

    it('should calculate increments when no yesterday analytics exist', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayAnalytics = {
        ...mockAnalytics,
        _id: 'test-object-id',
        date: today,
      };

      mockModel.findOne
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue(null), // No yesterday analytics
        })
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue(todayAnalytics),
        });

      mockModel.findOneAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...todayAnalytics,
          totalCommentsIncrement: 5,
          totalLikesIncrement: 10,
          totalViewsIncrement: 100,
        }),
      });

      const metrics = {
        totalComments: 5,
        totalLikes: 10,
        totalViews: 100,
      };

      const result = await service.updateTodayAnalytics(
        mockPostId,
        mockPlatform,
        metrics,
      );

      expect(result).toBeDefined();
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            totalCommentsIncrement: 5,
            totalLikesIncrement: 10,
            totalViewsIncrement: 100,
          }),
        }),
        { returnDocument: 'after', upsert: true },
      );
    });

    it('should return null when post not found', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      // Override postsService.findOne to return null
      const postsService = service['postsService'] as any;
      postsService.findOne = vi.fn().mockResolvedValue(null);

      const metrics = {
        totalComments: 5,
        totalLikes: 10,
        totalViews: 100,
      };

      const result = await service.updateTodayAnalytics(
        mockPostId,
        mockPlatform,
        metrics,
      );

      expect(result).toBeNull();
      expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should calculate correct engagement rate', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      mockModel.findOneAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockAnalytics),
      });

      const metrics = {
        totalComments: 50,
        totalLikes: 100,
        totalShares: 25,
        totalViews: 1000,
      };

      await service.updateTodayAnalytics(mockPostId, mockPlatform, metrics);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            engagementRate: 17.5, // (100 + 50 + 25) / 1000 * 100
          }),
        }),
        { returnDocument: 'after', upsert: true },
      );
    });

    it('should handle zero views for engagement rate', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      mockModel.findOneAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockAnalytics),
      });

      const metrics = {
        totalComments: 5,
        totalLikes: 10,
        totalViews: 0,
      };

      await service.updateTodayAnalytics(mockPostId, mockPlatform, metrics);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          $set: expect.objectContaining({
            engagementRate: 0,
          }),
        }),
        { returnDocument: 'after', upsert: true },
      );
    });
  });

  describe('getAnalyticsByDateRange', () => {
    it('should aggregate analytics for date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const aggregatedData = [
        {
          _id: { platform: 'twitter' },
          avgEngagementRate: 15,
          totalComments: 50,
          totalLikes: 100,
          totalSaves: 10,
          totalShares: 20,
          totalViews: 1000,
        },
      ];

      mockModel.aggregate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(aggregatedData),
      });

      const result = await service.getAnalyticsByDateRange(
        mockPostId,
        startDate,
        endDate,
      );

      expect(mockModel.aggregate).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
