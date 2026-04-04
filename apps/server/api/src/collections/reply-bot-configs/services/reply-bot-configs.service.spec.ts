import { ReplyBotConfig } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyBotConfigsService } from '@api/collections/reply-bot-configs/services/reply-bot-configs.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

const MOCK_ORG_ID = '507f1f77bcf86cd799439011';
const MOCK_CONFIG_ID = '507f191e810c19729de860ea';
const MOCK_ACCOUNT_ID = '6082d7fa99955cf5d6c7c23b';

describe('ReplyBotConfigsService', () => {
  let service: ReplyBotConfigsService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = Object.assign(
      vi.fn().mockImplementation(() => ({ save: vi.fn() })),
      {
        aggregate: vi.fn().mockReturnValue({ exec: vi.fn() }),
        aggregatePaginate: vi.fn(),
        collection: { name: 'reply-bot-configs' },
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
        modelName: 'ReplyBotConfig',
        updateMany: vi.fn().mockReturnValue({ exec: vi.fn() }),
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReplyBotConfigsService,
        {
          provide: getModelToken(ReplyBotConfig.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
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

    service = module.get<ReplyBotConfigsService>(ReplyBotConfigsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toggleActive', () => {
    it('should throw NotFoundException when config not found', async () => {
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue(null);

      await expect(
        service.toggleActive(
          '507f1f77bcf86cd799439011',
          '507f1f77bcf86cd799439022',
        ),
      ).rejects.toThrow('not found');

      findOneSpy.mockRestore();
    });

    it('should toggle isActive from true to false', async () => {
      const mockConfig = { _id: 'cfg-1', isActive: true };
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockConfig as never);
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({ ...mockConfig, isActive: false } as never);

      await service.toggleActive(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
      );

      expect(patchSpy).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        expect.objectContaining({
          isActive: false,
        }),
      );

      findOneSpy.mockRestore();
      patchSpy.mockRestore();
    });
  });

  describe('findActive', () => {
    it('should query for active non-deleted configs by organization', async () => {
      const mockConfigs = [{ _id: 'cfg-1' }];
      const findSpy = vi
        .spyOn(service, 'find')
        .mockResolvedValue(mockConfigs as never);

      const result = await service.findActive('507f1f77bcf86cd799439011');

      expect(result).toEqual(mockConfigs);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isDeleted: false,
        }),
      );

      findSpy.mockRestore();
    });
  });

  describe('findActiveByOrganization', () => {
    it('should delegate to findActive', async () => {
      const findActiveSpy = vi
        .spyOn(service, 'findActive')
        .mockResolvedValue([]);

      await service.findActiveByOrganization(MOCK_ORG_ID);

      expect(findActiveSpy).toHaveBeenCalledWith(MOCK_ORG_ID);

      findActiveSpy.mockRestore();
    });
  });

  describe('findOneById', () => {
    it('should query by id and organization with isDeleted false', async () => {
      const mockConfig = { _id: 'cfg-1' };
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockConfig as never);

      const result = await service.findOneById(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
      );

      expect(result).toEqual(mockConfig);
      expect(findOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
        }),
      );

      findOneSpy.mockRestore();
    });
  });

  describe('findActiveByType', () => {
    it('should query active configs by type', async () => {
      const mockConfigs = [{ _id: 'cfg-1', type: 'reply' }];
      const findSpy = vi
        .spyOn(service, 'find')
        .mockResolvedValue(mockConfigs as never);

      const result = await service.findActiveByType('reply' as never);

      expect(result).toEqual(mockConfigs);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isDeleted: false,
          type: 'reply',
        }),
      );

      findSpy.mockRestore();
    });
  });

  describe('canReply', () => {
    it('should return false when config not found', async () => {
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue(null);

      const result = await service.canReply(MOCK_CONFIG_ID, MOCK_ORG_ID);

      expect(result).toBe(false);

      findOneSpy.mockRestore();
    });

    it('should return false when config is inactive', async () => {
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue({
        isActive: false,
        rateLimits: {},
      } as never);

      const result = await service.canReply(MOCK_CONFIG_ID, MOCK_ORG_ID);

      expect(result).toBe(false);

      findOneSpy.mockRestore();
    });

    it('should return true when hourly counter needs reset', async () => {
      const pastDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue({
        isActive: true,
        rateLimits: {
          currentDayCount: 0,
          currentHourCount: 100,
          dayResetAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          hourResetAt: pastDate,
          maxRepliesPerDay: 50,
          maxRepliesPerHour: 10,
        },
      } as never);
      const mockModel = service['model'] as any;
      mockModel.updateOne = vi.fn().mockReturnValue({ exec: vi.fn() });

      const result = await service.canReply(MOCK_CONFIG_ID, MOCK_ORG_ID);

      expect(result).toBe(true);

      findOneSpy.mockRestore();
    });

    it('should return false when hourly limit reached and not reset time', async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue({
        isActive: true,
        rateLimits: {
          currentDayCount: 10,
          currentHourCount: 10,
          dayResetAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          hourResetAt: futureDate,
          maxRepliesPerDay: 50,
          maxRepliesPerHour: 10,
        },
      } as never);

      const result = await service.canReply(MOCK_CONFIG_ID, MOCK_ORG_ID);

      expect(result).toBe(false);

      findOneSpy.mockRestore();
    });

    it('should return false when daily limit reached and not reset time', async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000);
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue({
        isActive: true,
        rateLimits: {
          currentDayCount: 50,
          currentHourCount: 5,
          dayResetAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          hourResetAt: futureDate,
          maxRepliesPerDay: 50,
          maxRepliesPerHour: 10,
        },
      } as never);

      const result = await service.canReply(MOCK_CONFIG_ID, MOCK_ORG_ID);

      expect(result).toBe(false);

      findOneSpy.mockRestore();
    });
  });

  describe('incrementReplyCounters', () => {
    it('should increment hour, day, and total reply counters', async () => {
      const mockModel = service['model'] as any;
      mockModel.updateOne = vi.fn().mockReturnValue({ exec: vi.fn() });

      await service.incrementReplyCounters(MOCK_CONFIG_ID);

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $inc: expect.objectContaining({
            'rateLimits.currentDayCount': 1,
            'rateLimits.currentHourCount': 1,
            totalRepliesSent: 1,
          }),
        }),
      );
    });
  });

  describe('incrementDmCounter', () => {
    it('should increment totalDmsSent', async () => {
      const mockModel = service['model'] as any;
      mockModel.updateOne = vi.fn().mockReturnValue({ exec: vi.fn() });

      await service.incrementDmCounter(MOCK_CONFIG_ID);

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $inc: { totalDmsSent: 1 },
        }),
      );
    });
  });

  describe('incrementSkippedCounter', () => {
    it('should increment totalSkipped', async () => {
      const mockModel = service['model'] as any;
      mockModel.updateOne = vi.fn().mockReturnValue({ exec: vi.fn() });

      await service.incrementSkippedCounter(MOCK_CONFIG_ID);

      expect(mockModel.updateOne).toHaveBeenCalledWith(expect.anything(), {
        $inc: { totalSkipped: 1 },
      });
    });
  });

  describe('incrementFailedCounter', () => {
    it('should increment totalFailed', async () => {
      const mockModel = service['model'] as any;
      mockModel.updateOne = vi.fn().mockReturnValue({ exec: vi.fn() });

      await service.incrementFailedCounter(MOCK_CONFIG_ID);

      expect(mockModel.updateOne).toHaveBeenCalledWith(expect.anything(), {
        $inc: { totalFailed: 1 },
      });
    });
  });

  describe('addMonitoredAccount', () => {
    it('should throw NotFoundException when config not found', async () => {
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue(null);

      await expect(
        service.addMonitoredAccount(
          MOCK_CONFIG_ID,
          MOCK_ACCOUNT_ID,
          MOCK_ORG_ID,
        ),
      ).rejects.toThrow('not found');

      findOneSpy.mockRestore();
    });

    it('should add account to monitoredAccounts array', async () => {
      const mockConfig = { _id: MOCK_CONFIG_ID, monitoredAccounts: [] };
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockConfig as never);
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.addMonitoredAccount(
        MOCK_CONFIG_ID,
        '507f1f77bcf86cd799439033',
        MOCK_ORG_ID,
      );

      expect(patchSpy).toHaveBeenCalledWith(
        MOCK_CONFIG_ID,
        expect.objectContaining({
          monitoredAccounts: expect.any(Array),
        }),
      );

      findOneSpy.mockRestore();
      patchSpy.mockRestore();
    });
  });

  describe('removeMonitoredAccount', () => {
    it('should throw NotFoundException when config not found', async () => {
      const findOneSpy = vi.spyOn(service, 'findOne').mockResolvedValue(null);

      await expect(
        service.removeMonitoredAccount(
          MOCK_CONFIG_ID,
          MOCK_ACCOUNT_ID,
          MOCK_ORG_ID,
        ),
      ).rejects.toThrow('not found');

      findOneSpy.mockRestore();
    });

    it('should remove account from monitoredAccounts array', async () => {
      const { Types } = await import('mongoose');
      const accountId = new Types.ObjectId('507f1f77bcf86cd799439033');
      const mockConfig = {
        _id: MOCK_CONFIG_ID,
        monitoredAccounts: [accountId],
      };
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockConfig as never);
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.removeMonitoredAccount(
        MOCK_CONFIG_ID,
        '507f1f77bcf86cd799439033',
        MOCK_ORG_ID,
      );

      expect(patchSpy).toHaveBeenCalledWith(
        MOCK_CONFIG_ID,
        expect.objectContaining({
          monitoredAccounts: [],
        }),
      );

      findOneSpy.mockRestore();
      patchSpy.mockRestore();
    });
  });
});
