import { AdPerformance } from '@api/collections/ad-performance/schemas/ad-performance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { AdPerformanceService } from './ad-performance.service';

describe('AdPerformanceService', () => {
  let service: AdPerformanceService;

  interface MockQuery {
    sort: ReturnType<typeof vi.fn>;
    skip: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    lean: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  }

  const createMockQuery = (resolvedValue: unknown = []): MockQuery => {
    const query = {
      exec: vi.fn().mockResolvedValue(resolvedValue),
      lean: vi.fn(),
      limit: vi.fn(),
      skip: vi.fn(),
      sort: vi.fn(),
    };
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    return query;
  };

  let mockModel: {
    bulkWrite: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };

  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockModel = {
      bulkWrite: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      updateMany: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdPerformanceService,
        {
          provide: getModelToken(AdPerformance.name, DB_CONNECTIONS.CLOUD),
          useValue: mockModel,
        },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AdPerformanceService>(AdPerformanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsert', () => {
    it('should call findOneAndUpdate with correct filter and $set operator', async () => {
      const data: Partial<AdPerformance> = {
        adPlatform: 'facebook',
        date: new Date('2026-01-01'),
        externalAccountId: 'acc-123',
        granularity: 'account',
      };
      const expected = { ...data, _id: new Types.ObjectId() };
      mockModel.findOneAndUpdate.mockResolvedValue(expected);

      const result = await service.upsert(data);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          adPlatform: 'facebook',
          granularity: 'account',
        }),
        { $set: data },
        { new: true, upsert: true },
      );
      expect(result).toBe(expected);
    });

    it('should include externalCampaignId in filter for campaign granularity', async () => {
      const data: Partial<AdPerformance> = {
        adPlatform: 'google',
        externalCampaignId: 'camp-456',
        granularity: 'campaign',
      };
      mockModel.findOneAndUpdate.mockResolvedValue(data);

      await service.upsert(data);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ externalCampaignId: 'camp-456' }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should include externalAdId in filter for ad granularity', async () => {
      const data: Partial<AdPerformance> = {
        adPlatform: 'tiktok',
        externalAdId: 'ad-789',
        granularity: 'ad',
      };
      mockModel.findOneAndUpdate.mockResolvedValue(data);

      await service.upsert(data);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ externalAdId: 'ad-789' }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('upsertBatch', () => {
    it('should call bulkWrite with updateOne operations and return total count', async () => {
      const records: Partial<AdPerformance>[] = [
        { adPlatform: 'facebook', granularity: 'account' },
        { adPlatform: 'google', granularity: 'campaign' },
      ];
      mockModel.bulkWrite.mockResolvedValue({
        modifiedCount: 1,
        upsertedCount: 1,
      });

      const result = await service.upsertBatch(records);

      expect(mockModel.bulkWrite).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ updateOne: expect.any(Object) }),
        ]),
      );
      expect(result).toBe(2);
    });

    it('should return 0 when no records are written', async () => {
      mockModel.bulkWrite.mockResolvedValue({
        modifiedCount: 0,
        upsertedCount: 0,
      });

      const result = await service.upsertBatch([]);

      expect(result).toBe(0);
    });
  });

  describe('findByOrganization', () => {
    it('should query with organizationId and isDeleted filter', async () => {
      const orgId = new Types.ObjectId().toString();
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findByOrganization(orgId, {});

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });

    it('should apply adPlatform filter when provided', async () => {
      const orgId = new Types.ObjectId().toString();
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findByOrganization(orgId, { adPlatform: 'tiktok' });

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ adPlatform: 'tiktok' }),
      );
    });

    it('should apply date range filter when startDate and endDate are provided', async () => {
      const orgId = new Types.ObjectId().toString();
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findByOrganization(orgId, { endDate, startDate });

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          date: { $gte: startDate, $lte: endDate },
        }),
      );
    });

    it('should use default limit=50 and offset=0 when not provided', async () => {
      const orgId = new Types.ObjectId().toString();
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findByOrganization(orgId, {});

      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.limit).toHaveBeenCalledWith(50);
    });
  });

  describe('findTopPerformers', () => {
    it('should default scope to public when not provided', async () => {
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findTopPerformers({});

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'public' }),
      );
    });

    it('should sort by the provided metric field', async () => {
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findTopPerformers({ metric: 'ctr' });

      expect(query.sort).toHaveBeenCalledWith({ ctr: -1 });
    });

    it('should default sort to performanceScore when no metric given', async () => {
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findTopPerformers({});

      expect(query.sort).toHaveBeenCalledWith({ performanceScore: -1 });
    });
  });

  describe('findById', () => {
    it('should return null for invalid ObjectId', async () => {
      const result = await service.findById('not-an-id');
      expect(result).toBeNull();
      expect(mockModel.findOne).not.toHaveBeenCalled();
    });

    it('should query by valid ObjectId with isDeleted false', async () => {
      const id = new Types.ObjectId().toString();
      const mockQuery = createMockQuery(null);
      mockModel.findOne.mockReturnValue(mockQuery);

      await service.findById(id);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });
  });

  describe('removeOrgFromAggregation', () => {
    it('should update scope to organization for all org records', async () => {
      const orgId = new Types.ObjectId().toString();
      mockModel.updateMany.mockResolvedValue({ modifiedCount: 5 });

      const result = await service.removeOrgFromAggregation(orgId);

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ organization: expect.any(Types.ObjectId) }),
        { $set: { scope: 'organization' } },
      );
      expect(result).toBe(5);
    });
  });
});
