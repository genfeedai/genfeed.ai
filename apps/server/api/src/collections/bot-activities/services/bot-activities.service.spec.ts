import { BotActivitiesQueryDto } from '@api/collections/bot-activities/dto/bot-activities-query.dto';
import { BotActivity } from '@api/collections/bot-activities/schemas/bot-activity.schema';
import { BotActivitiesService } from '@api/collections/bot-activities/services/bot-activities.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const MOCK_ORG_ID = '507f1f77bcf86cd799439011';
const MOCK_CONFIG_ID = '507f191e810c19729de860ea';
const MOCK_ACTIVITY_ID = '507f1f77bcf86cd799439014';

describe('BotActivitiesService', () => {
  let service: BotActivitiesService;
  let _model: ReturnType<typeof createMockModel>;

  beforeEach(async () => {
    const mockModel = vi.fn();

    mockModel.collection = { name: 'bot-activities' };
    mockModel.modelName = 'BotActivity';
    mockModel.aggregate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    });
    mockModel.countDocuments = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    });
    mockModel.find = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
      lean: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
    });
    mockModel.findById = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findByIdAndUpdate = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findOne = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
      populate: vi.fn().mockReturnThis(),
    });
    mockModel.findOneAndUpdate = vi.fn().mockResolvedValue(null);
    mockModel.updateMany = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotActivitiesService,
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

    service = module.get<BotActivitiesService>(BotActivitiesService);
    _model = module.get(PrismaService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findWithFilters', () => {
    it('should query with organization and isDeleted filters', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const mockActivities = [{ _id: 'act-1' }];

      _model.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockReturnValue({
                  exec: vi.fn().mockResolvedValue(mockActivities),
                }),
              }),
            }),
          }),
        }),
      });
      _model.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(1),
      });

      const result = await service.findWithFilters(
        orgId,
        undefined,
        {} as BotActivitiesQueryDto,
      );

      expect(result.activities).toEqual(mockActivities);
      expect(result.total).toBe(1);
      expect(_model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
        }),
      );
    });

    it('should apply optional filters for status and botType', async () => {
      const orgId = '507f1f77bcf86cd799439011';

      _model.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              populate: vi.fn().mockReturnValue({
                lean: vi.fn().mockReturnValue({
                  exec: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
      });
      _model.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      });

      const query = {
        botType: 'reply',
        limit: 10,
        offset: 5,
        status: 'completed',
      } as unknown as BotActivitiesQueryDto;
      await service.findWithFilters(orgId, undefined, query);

      expect(_model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          botType: 'reply',
          status: 'completed',
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should return zero stats when no activities exist', async () => {
      _model.aggregate.mockResolvedValue([]);

      const result = await service.getStats('507f1f77bcf86cd799439011');

      expect(result).toEqual({
        completed: 0,
        failed: 0,
        pending: 0,
        skipped: 0,
        total: 0,
        totalDms: 0,
        totalReplies: 0,
      });
    });

    it('should return aggregated stats when activities exist', async () => {
      const mockStats = {
        _id: null,
        completed: 5,
        failed: 2,
        pending: 2,
        skipped: 1,
        total: 10,
        totalDms: 3,
        totalReplies: 5,
      };
      _model.aggregate.mockResolvedValue([mockStats]);

      const result = await service.getStats('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockStats);
    });

    it('should include replyBotConfigId filter when provided', async () => {
      _model.aggregate.mockResolvedValue([]);

      await service.getStats(
        '507f1f77bcf86cd799439011',
        undefined,
        '507f1f77bcf86cd799439033',
      );

      expect(_model.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              replyBotConfig: expect.anything(),
            }),
          }),
        ]),
      );
    });
  });

  describe('markProcessing', () => {
    it('should update status to processing', async () => {
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.markProcessing(MOCK_ACTIVITY_ID);

      expect(patchSpy).toHaveBeenCalledWith(
        MOCK_ACTIVITY_ID,
        expect.objectContaining({
          status: 'processing',
        }),
      );
    });
  });

  describe('markCompleted', () => {
    it('should update with reply info and completed status', async () => {
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.markCompleted(
        MOCK_ACTIVITY_ID,
        'tweet-123',
        'Reply text',
        'https://x.com/status/123',
        true,
        'DM text',
      );

      expect(patchSpy).toHaveBeenCalledWith(
        MOCK_ACTIVITY_ID,
        expect.objectContaining({
          dmSent: true,
          dmText: 'DM text',
          replyTweetId: 'tweet-123',
          replyTweetText: 'Reply text',
          replyTweetUrl: 'https://x.com/status/123',
          status: 'completed',
        }),
      );
    });

    it('should not include dmSent and dmText when not provided', async () => {
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.markCompleted(MOCK_ACTIVITY_ID, 'tweet-123', 'Reply text');

      const updateArg = patchSpy.mock.calls[0][1];
      expect(updateArg).not.toHaveProperty('dmSent');
      expect(updateArg).not.toHaveProperty('dmText');
    });
  });

  describe('markFailed', () => {
    it('should update with error info and failed status', async () => {
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.markFailed(MOCK_ACTIVITY_ID, 'Rate limit exceeded', {
        code: 429,
      });

      expect(patchSpy).toHaveBeenCalledWith(
        MOCK_ACTIVITY_ID,
        expect.objectContaining({
          errorDetails: { code: 429 },
          errorMessage: 'Rate limit exceeded',
          status: 'failed',
        }),
      );
    });
  });

  describe('markSkipped', () => {
    it('should update with skip reason and skipped status', async () => {
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.markSkipped(MOCK_ACTIVITY_ID, 'Duplicate content');

      expect(patchSpy).toHaveBeenCalledWith(
        MOCK_ACTIVITY_ID,
        expect.objectContaining({
          skipReason: 'Duplicate content',
          status: 'skipped',
        }),
      );
    });
  });

  describe('findRecentByConfig', () => {
    it('should query with configId filter and sort by createdAt desc', async () => {
      const mockResults = [
        { _id: MOCK_ACTIVITY_ID },
        { _id: MOCK_ACTIVITY_ID },
      ];
      _model.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            lean: vi.fn().mockReturnValue({
              exec: vi.fn().mockResolvedValue(mockResults),
            }),
          }),
        }),
      });

      const result = await service.findRecentByConfig(
        MOCK_CONFIG_ID,
        undefined,
        5,
      );

      expect(result).toEqual(mockResults);
      expect(_model.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should call findOneAndUpdate with correct filters', async () => {
      const mockUpdated = { _id: MOCK_ACTIVITY_ID, status: 'completed' };
      _model.findOneAndUpdate.mockResolvedValue(mockUpdated);

      const result = await service.updateStatus(MOCK_ACTIVITY_ID, MOCK_ORG_ID, {
        dmSent: true,
        replyTweetId: 'tweet-1',
        status: 'completed' as never,
      });

      expect(result).toEqual(mockUpdated);
      expect(_model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            dmSent: true,
            replyTweetId: 'tweet-1',
            status: 'completed',
          }),
        }),
        expect.objectContaining({ returnDocument: 'after' }),
      );
    });

    it('should map replyText to replyTweetText and completedAt to processedAt', async () => {
      const completedAt = new Date();
      _model.findOneAndUpdate.mockResolvedValue(null);

      await service.updateStatus(MOCK_ACTIVITY_ID, MOCK_ORG_ID, {
        completedAt,
        replyText: 'My reply',
      });

      expect(_model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            processedAt: completedAt,
            replyTweetText: 'My reply',
          }),
        }),
        expect.anything(),
      );
    });
  });
});
