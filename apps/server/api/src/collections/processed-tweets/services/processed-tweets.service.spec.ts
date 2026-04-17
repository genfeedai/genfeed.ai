import { ProcessedTweet } from '@api/collections/processed-tweets/schemas/processed-tweet.schema';
import { ProcessedTweetsService } from '@api/collections/processed-tweets/services/processed-tweets.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('ProcessedTweetsService', () => {
  let service: ProcessedTweetsService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = Object.assign(
      vi.fn().mockImplementation(() => ({ save: vi.fn() })),
      {
        aggregate: vi.fn().mockReturnValue({ exec: vi.fn() }),
        aggregatePaginate: vi.fn(),
        collection: { name: 'processed-tweets' },
        deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
        find: vi.fn().mockReturnValue({
          exec: vi.fn(),
          lean: vi.fn().mockReturnThis(),
          populate: vi.fn().mockReturnThis(),
        }),
        findById: vi.fn().mockReturnValue({
          exec: vi.fn(),
          populate: vi.fn().mockReturnThis(),
        }),
        findByIdAndUpdate: vi.fn().mockReturnValue({
          exec: vi.fn(),
          populate: vi.fn().mockReturnThis(),
        }),
        findOne: vi.fn().mockReturnValue({
          exec: vi.fn(),
          populate: vi.fn().mockReturnThis(),
        }),
        modelName: 'ProcessedTweet',
        updateMany: vi.fn().mockReturnValue({ exec: vi.fn() }),
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessedTweetsService,
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
      ],
    }).compile();

    service = module.get<ProcessedTweetsService>(ProcessedTweetsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isProcessed', () => {
    it('should return true when tweet has been processed', async () => {
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ tweetId: '123' }),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.isProcessed(
        '123',
        '507f1f77bcf86cd799439011',
        'twitter-reply-bot' as never,
      );

      expect(result).toBe(true);
    });

    it('should return false when tweet has not been processed', async () => {
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.isProcessed(
        '456',
        '507f1f77bcf86cd799439011',
        'twitter-reply-bot' as never,
      );

      expect(result).toBe(false);
    });
  });

  describe('markAsProcessed', () => {
    it('should create a new processed tweet record', async () => {
      const mockDoc = { _id: 'abc', save: vi.fn(), tweetId: '123' };
      mockModel.mockImplementation(function () {
        return { save: vi.fn().mockResolvedValue(mockDoc) };
      });

      const result = await service.markAsProcessed(
        '123',
        '507f1f77bcf86cd799439011',
        'twitter-reply-bot' as never,
      );

      expect(result).toBeDefined();
    });

    it('should return existing record on duplicate key error (code 11000)', async () => {
      const existingDoc = { _id: 'existing', tweetId: '123' };
      const duplicateError = Object.assign(new Error('duplicate'), {
        code: 11000,
      });

      mockModel.mockImplementation(function () {
        return { save: vi.fn().mockRejectedValue(duplicateError) };
      });
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingDoc),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.markAsProcessed(
        '123',
        '507f1f77bcf86cd799439011',
        'twitter-reply-bot' as never,
      );

      expect(result).toEqual(existingDoc);
    });

    it('should throw if duplicate key error but existing doc not found', async () => {
      const duplicateError = Object.assign(new Error('duplicate'), {
        code: 11000,
      });

      mockModel.mockImplementation(function () {
        return { save: vi.fn().mockRejectedValue(duplicateError) };
      });
      mockModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
        populate: vi.fn().mockReturnThis(),
      });

      await expect(
        service.markAsProcessed(
          '123',
          '507f1f77bcf86cd799439011',
          'twitter-reply-bot' as never,
        ),
      ).rejects.toThrow('Failed to find existing processed tweet');
    });

    it('should rethrow non-duplicate-key errors', async () => {
      const genericError = new Error('db connection failed');

      mockModel.mockImplementation(function () {
        return { save: vi.fn().mockRejectedValue(genericError) };
      });

      await expect(
        service.markAsProcessed(
          '123',
          '507f1f77bcf86cd799439011',
          'twitter-reply-bot' as never,
        ),
      ).rejects.toThrow('db connection failed');
    });
  });

  describe('getProcessedTweetIds', () => {
    it('should return a Set of processed tweet IDs', async () => {
      mockModel.find = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([{ tweetId: 'a' }, { tweetId: 'c' }]),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.getProcessedTweetIds(
        ['a', 'b', 'c'],
        '507f1f77bcf86cd799439011',
        'twitter-reply-bot' as never,
      );

      expect(result).toBeInstanceOf(Set);
      expect(result.has('a')).toBe(true);
      expect(result.has('b')).toBe(false);
      expect(result.has('c')).toBe(true);
      expect(result.size).toBe(2);
    });

    it('should return an empty Set when no tweets are processed', async () => {
      mockModel.find = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
        lean: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
      });

      const result = await service.getProcessedTweetIds(
        ['a', 'b'],
        '507f1f77bcf86cd799439011',
        'twitter-reply-bot' as never,
      );

      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });
  });

  describe('cleanupOldRecords', () => {
    it('should call deleteMany and return deletedCount', async () => {
      mockModel.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 5 });

      const result = await service.cleanupOldRecords(7);

      expect(result).toBe(5);
      expect(mockModel.deleteMany).toHaveBeenCalledWith({
        processedAt: { $lt: expect.any(Date) },
      });
    });

    it('should default to 7 days if no argument provided', async () => {
      mockModel.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });

      const result = await service.cleanupOldRecords();

      expect(result).toBe(0);
      expect(mockModel.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
