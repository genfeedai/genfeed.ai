import { MonitoredAccount } from '@api/collections/monitored-accounts/schemas/monitored-account.schema';
import { MonitoredAccountsService } from '@api/collections/monitored-accounts/services/monitored-accounts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

const MOCK_ORG_ID = '507f1f77bcf86cd799439011';
const MOCK_CONFIG_ID = '507f191e810c19729de860ea';
const MOCK_ACCOUNT_ID = '6082d7fa99955cf5d6c7c23b';

describe('MonitoredAccountsService', () => {
  let service: MonitoredAccountsService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = Object.assign(
      vi.fn().mockImplementation(() => ({ save: vi.fn() })),
      {
        aggregate: vi.fn().mockReturnValue({ exec: vi.fn() }),
        aggregatePaginate: vi.fn(),
        collection: { name: 'monitored-accounts' },
        find: vi.fn().mockReturnValue({
          exec: vi.fn(),
          lean: vi.fn().mockReturnThis(),
          populate: vi.fn().mockReturnThis(),
          sort: vi.fn().mockReturnThis(),
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
        findOneAndUpdate: vi.fn().mockReturnValue({ exec: vi.fn() }),
        modelName: 'MonitoredAccount',
        updateMany: vi.fn().mockReturnValue({ exec: vi.fn() }),
        updateOne: vi.fn().mockReturnValue({ exec: vi.fn() }),
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoredAccountsService,
        {
          provide: getModelToken(MonitoredAccount.name, DB_CONNECTIONS.CLOUD),
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

    service = module.get<MonitoredAccountsService>(MonitoredAccountsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toggleActive', () => {
    it('should throw NotFoundException when account not found', async () => {
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
      const mockAccount = { _id: 'acc-1', isActive: true };
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockAccount as never);
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({ ...mockAccount, isActive: false } as never);

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

    it('should toggle isActive from false to true', async () => {
      const mockAccount = { _id: 'acc-1', isActive: false };
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockAccount as never);
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({ ...mockAccount, isActive: true } as never);

      await service.toggleActive(
        '507f1f77bcf86cd799439011',
        '507f1f77bcf86cd799439022',
      );

      expect(patchSpy).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        expect.objectContaining({
          isActive: true,
        }),
      );

      findOneSpy.mockRestore();
      patchSpy.mockRestore();
    });
  });

  describe('findActiveByOrganization', () => {
    it('should query for active non-deleted accounts', async () => {
      const mockAccounts = [{ _id: 'acc-1' }];
      const findSpy = vi
        .spyOn(service, 'find')
        .mockResolvedValue(mockAccounts as never);

      const result = await service.findActiveByOrganization(
        '507f1f77bcf86cd799439011',
      );

      expect(result).toEqual(mockAccounts);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isDeleted: false,
        }),
      );

      findSpy.mockRestore();
    });
  });

  describe('updateLastChecked', () => {
    it('should update lastCheckedAt and lastCheckedTweetId', async () => {
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({} as never);

      await service.updateLastChecked(MOCK_ACCOUNT_ID, 'tweet-999');

      expect(patchSpy).toHaveBeenCalledWith(
        MOCK_ACCOUNT_ID,
        expect.objectContaining({
          lastCheckedTweetId: 'tweet-999',
        }),
      );

      patchSpy.mockRestore();
    });
  });

  describe('incrementProcessedCount', () => {
    it('should call updateOne with $inc for tweetsProcessedCount', async () => {
      const mockModel = service['model'] as any;
      mockModel.updateOne = vi.fn().mockReturnValue({ exec: vi.fn() });

      await service.incrementProcessedCount(MOCK_ACCOUNT_ID);

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $inc: { tweetsProcessedCount: 1 },
        }),
      );
    });
  });

  describe('incrementRepliesCount', () => {
    it('should call updateOne with $inc for repliesSentCount', async () => {
      const mockModel = service['model'] as any;
      mockModel.updateOne = vi.fn().mockReturnValue({ exec: vi.fn() });

      await service.incrementRepliesCount(MOCK_ACCOUNT_ID);

      expect(mockModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $inc: { repliesSentCount: 1 },
        }),
      );
    });
  });

  describe('findByTwitterUserId', () => {
    it('should query by twitterUserId and organization', async () => {
      const mockAccount = { _id: 'acc-1', twitterUserId: 'tw-123' };
      const findOneSpy = vi
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockAccount as never);

      const result = await service.findByTwitterUserId(
        'tw-123',
        '507f1f77bcf86cd799439011',
      );

      expect(result).toEqual(mockAccount);
      expect(findOneSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
          twitterUserId: 'tw-123',
        }),
      );

      findOneSpy.mockRestore();
    });
  });

  describe('findByBotConfig', () => {
    it('should query active accounts by bot config and organization', async () => {
      const mockAccounts = [{ _id: MOCK_ACCOUNT_ID }];
      const findSpy = vi
        .spyOn(service, 'find')
        .mockResolvedValue(mockAccounts as never);

      const result = await service.findByBotConfig(MOCK_CONFIG_ID, MOCK_ORG_ID);

      expect(result).toEqual(mockAccounts);
      expect(findSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          isDeleted: false,
        }),
      );

      findSpy.mockRestore();
    });
  });

  describe('updateLastProcessed', () => {
    it('should call findOneAndUpdate with correct params', async () => {
      const mockModel = service['model'] as any;
      const mockResult = {
        _id: MOCK_ACCOUNT_ID,
        lastProcessedTweetId: 'tweet-100',
      };
      mockModel.findOneAndUpdate = vi.fn().mockResolvedValue(mockResult);

      const result = await service.updateLastProcessed(
        MOCK_ACCOUNT_ID,
        MOCK_ORG_ID,
        'tweet-100',
      );

      expect(result).toEqual(mockResult);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          isDeleted: false,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            lastProcessedTweetId: 'tweet-100',
          }),
        }),
        expect.objectContaining({ returnDocument: 'after' }),
      );
    });
  });
});
