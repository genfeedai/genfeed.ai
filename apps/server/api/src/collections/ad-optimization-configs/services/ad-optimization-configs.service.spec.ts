import { AdOptimizationConfig } from '@api/collections/ad-optimization-configs/schemas/ad-optimization-config.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

import { AdOptimizationConfigsService } from './ad-optimization-configs.service';

type MockQuery = {
  exec: ReturnType<typeof vi.fn>;
  lean: ReturnType<typeof vi.fn>;
};

const makeMockQuery = (resolvedValue: unknown): MockQuery => ({
  exec: vi.fn().mockResolvedValue(resolvedValue),
  lean: vi.fn().mockReturnThis(),
});

describe('AdOptimizationConfigsService', () => {
  let service: AdOptimizationConfigsService;
  let model: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
  };
  let loggerService: vi.Mocked<LoggerService>;

  const orgId = new Types.ObjectId().toString();

  const mockConfig = {
    _id: new Types.ObjectId(),
    isDeleted: false,
    isEnabled: true,
    organization: new Types.ObjectId(orgId),
  };

  beforeEach(async () => {
    model = {
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };

    loggerService = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdOptimizationConfigsService,
        {
          provide: getModelToken(
            AdOptimizationConfig.name,
            DB_CONNECTIONS.CLOUD,
          ),
          useValue: model,
        },
        {
          provide: LoggerService,
          useValue: loggerService,
        },
      ],
    }).compile();

    service = module.get(AdOptimizationConfigsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByOrganization', () => {
    it('should return a config document when found', async () => {
      model.findOne.mockReturnValue(makeMockQuery(mockConfig));

      const result = await service.findByOrganization(orgId);

      expect(result).toEqual(mockConfig);
    });

    it('should return null when no config exists for the organization', async () => {
      model.findOne.mockReturnValue(makeMockQuery(null));

      const result = await service.findByOrganization(orgId);

      expect(result).toBeNull();
    });

    it('should query with isDeleted: false and correct org ObjectId', async () => {
      model.findOne.mockReturnValue(makeMockQuery(null));

      await service.findByOrganization(orgId);

      expect(model.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        organization: expect.any(Types.ObjectId),
      });
    });
  });

  describe('upsert', () => {
    it('should call findOneAndUpdate with upsert and return the document', async () => {
      model.findOneAndUpdate.mockReturnValue(makeMockQuery(mockConfig));

      const result = await service.upsert(orgId, { isEnabled: true });

      expect(result).toEqual(mockConfig);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
        expect.objectContaining({
          $set: expect.objectContaining({ isEnabled: true }),
        }),
        { new: true, upsert: true },
      );
    });

    it('should include organization ObjectId in $set', async () => {
      model.findOneAndUpdate.mockReturnValue(makeMockQuery(mockConfig));

      await service.upsert(orgId, {});

      const updateArg = model.findOneAndUpdate.mock.calls[0][1] as {
        $set: Record<string, unknown>;
      };
      expect(updateArg.$set.organization).toBeInstanceOf(Types.ObjectId);
    });

    it('should log success after upsert', async () => {
      model.findOneAndUpdate.mockReturnValue(makeMockQuery(mockConfig));

      await service.upsert(orgId, {});

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('upserted'),
      );
    });

    it('should log error and re-throw when findOneAndUpdate fails', async () => {
      model.findOneAndUpdate.mockReturnValue({
        exec: vi.fn().mockRejectedValue(new Error('db error')),
        lean: vi.fn().mockReturnThis(),
      });

      await expect(service.upsert(orgId, {})).rejects.toThrow('db error');
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('findAllEnabled', () => {
    it('should return all enabled non-deleted configs', async () => {
      const configs = [
        mockConfig,
        { ...mockConfig, _id: new Types.ObjectId() },
      ];
      model.find.mockReturnValue(makeMockQuery(configs));

      const result = await service.findAllEnabled();

      expect(result).toHaveLength(2);
      expect(model.find).toHaveBeenCalledWith({
        isDeleted: false,
        isEnabled: true,
      });
    });

    it('should return an empty array when no enabled configs exist', async () => {
      model.find.mockReturnValue(makeMockQuery([]));

      const result = await service.findAllEnabled();

      expect(result).toEqual([]);
    });
  });
});
