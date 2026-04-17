import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import { PostAnalytics } from '@api/collections/posts/schemas/post-analytics.schema';
import { PostAnalyticsService } from '@api/collections/posts/services/post-analytics.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostAnalyticsService - Edge Cases', () => {
  let service: PostAnalyticsService;
  let mockModel: Record<string, ReturnType<typeof vi.fn>>;
  let logger: LoggerService;

  beforeEach(async () => {
    mockModel = {
      aggregate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      }),
      collection: { name: 'post-analytics' },
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      modelName: 'PostAnalytics',
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
    logger = module.get<LoggerService>(LoggerService);
  });

  describe('findOrCreateTodayAnalytics', () => {
    it('should handle race condition with duplicate key error', async () => {
      const postId = 'test-object-id'.toString();
      const platform = CredentialPlatform.YOUTUBE;
      const data = { user: 'user-id' };

      // Simulate duplicate key error from findOneAndUpdate
      const duplicateKeyError: any = new Error('Duplicate key error');
      duplicateKeyError.code = 11000;
      mockModel.findOneAndUpdate.mockRejectedValueOnce(duplicateKeyError);

      // Mock the fallback findOne
      const existingAnalytics = { _id: 'existing-id', platform, post: postId };
      mockModel.findOne.mockReturnValueOnce({
        exec: vi.fn().mockResolvedValue(existingAnalytics),
      });

      const result = await service.findOrCreateTodayAnalytics(
        postId,
        platform,
        data,
      );

      expect(result).toBeDefined();
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          date: expect.any(Date),
          platform,
          post: new string(postId),
        },
        expect.objectContaining({
          $setOnInsert: expect.objectContaining({
            isDeleted: false,
            platform,
            post: new string(postId),
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
    });

    it('should throw error if not duplicate key error', async () => {
      const postId = 'test-object-id'.toString();
      const platform = CredentialPlatform.YOUTUBE;
      const data = { user: 'user-id' };

      const otherError = new Error('Database connection failed');
      mockModel.findOneAndUpdate.mockRejectedValueOnce(otherError);

      await expect(
        service.findOrCreateTodayAnalytics(postId, platform, data),
      ).rejects.toThrow('Database connection failed');
    });

    it('should successfully upsert analytics', async () => {
      const postId = 'test-object-id'.toString();
      const platform = CredentialPlatform.YOUTUBE;
      const data = { user: 'user-id' };

      const mockResult = { _id: 'new-analytics-id', platform, post: postId };
      mockModel.findOneAndUpdate.mockResolvedValueOnce(mockResult);

      await service.findOrCreateTodayAnalytics(postId, platform, data);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          date: expect.any(Date),
          platform,
          post: new string(postId),
        },
        {
          $setOnInsert: expect.objectContaining({
            isDeleted: false,
            platform,
            post: new string(postId),
            totalComments: 0,
            totalLikes: 0,
            totalShares: 0,
            totalViews: 0,
          }),
        },
        {
          returnDocument: 'after',
          setDefaultsOnInsert: true,
          upsert: true,
        },
      );
    });
  });

  describe('trackPostAnalytics', () => {
    it('should log warn when post has no externalId', async () => {
      const post = {
        _id: 'test-object-id',
        brand: 'test-object-id',
        ingredients: ['test-object-id'],
        organization: 'test-object-id',
        user: 'test-object-id',
        // No externalId
      } as PostDocument;

      const credential = {
        platform: CredentialPlatform.YOUTUBE,
      } as CredentialEntity;

      await service.trackPostAnalytics(post, credential, 'test-url');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No external ID'),
      );
    });

    it('should handle unsupported platform gracefully', async () => {
      const post = {
        _id: 'test-object-id',
        externalId: 'ext-123',
        ingredient: 'test-object-id',
        user: 'test-object-id',
      } as PostDocument;

      const credential = {
        platform: 'UNSUPPORTED_PLATFORM',
      } as CredentialEntity;

      await service.trackPostAnalytics(post, credential, 'test-url');

      expect(logger.warn).toHaveBeenCalledWith(
        'test-url unsupported platform: UNSUPPORTED_PLATFORM',
      );
    });

    it('should log error when platform service is unavailable', async () => {
      const post = {
        _id: 'test-object-id',
        brand: 'test-object-id',
        externalId: 'ext-123',
        ingredient: 'test-object-id',
        organization: 'test-object-id',
        user: 'test-object-id',
      } as PostDocument;

      const credential = {
        platform: CredentialPlatform.YOUTUBE,
      } as CredentialEntity;

      // youtubeService is @Optional() and not provided — getYoutubeAnalytics
      // catches the TypeError internally and logs it, then returns null.
      // trackPostAnalytics then receives null analytics and returns without error.
      await service.trackPostAnalytics(post, credential, 'test-url');

      // getYoutubeAnalytics catches its own error and logs via logger.error
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get YouTube analytics',
        expect.any(Error),
      );
    });
  });

  describe('getAnalyticsByDateRange', () => {
    it('should handle empty results gracefully', async () => {
      const postId = 'test-object-id'.toString();
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      const result = await service.getAnalyticsByDateRange(
        postId,
        startDate,
        endDate,
      );

      expect(result).toEqual([]);
    });

    it('should filter by platform when provided', async () => {
      const postId = 'test-object-id'.toString();
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');
      const platform = CredentialPlatform.YOUTUBE;

      mockModel.aggregate.mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });

      await service.getAnalyticsByDateRange(
        postId,
        startDate,
        endDate,
        platform,
      );

      expect(mockModel.aggregate).toHaveBeenCalledWith([
        {
          $match: expect.objectContaining({
            platform: CredentialPlatform.YOUTUBE,
          }),
        },
        { $sort: { date: 1 } },
      ]);
    });
  });
});
