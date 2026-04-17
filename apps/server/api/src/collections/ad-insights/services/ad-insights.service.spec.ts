import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type AdInsights } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { AdInsightsService } from './ad-insights.service';

describe('AdInsightsService', () => {
  let service: AdInsightsService;

  const createMockQuery = (resolvedValue: unknown = null) => {
    const query = {
      exec: vi.fn().mockResolvedValue(resolvedValue),
      lean: vi.fn(),
      sort: vi.fn(),
    };
    query.sort.mockReturnValue(query);
    query.lean.mockReturnValue(query);
    return query;
  };

  let mockModel: {
    deleteMany: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
  };

  let mockLogger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockModel = {
      deleteMany: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdInsightsService,
        { provide: PrismaService, useValue: mockModel },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AdInsightsService>(AdInsightsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('upsertInsight', () => {
    it('should upsert by adPlatform, industry, and insightType', async () => {
      const data: Partial<AdInsights> = {
        adPlatform: 'facebook',
        industry: 'ecommerce',
        insightType: 'benchmark' as never,
      };
      const expected = { ...data, _id: 'some-id' };
      mockModel.findOneAndUpdate.mockResolvedValue(expected);

      const result = await service.upsertInsight(data);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          adPlatform: 'facebook',
          industry: 'ecommerce',
          insightType: 'benchmark',
        }),
        { $set: data },
        { new: true, upsert: true },
      );
      expect(result).toBe(expected);
    });

    it('should use null for adPlatform and industry when not provided', async () => {
      const data: Partial<AdInsights> = { insightType: 'trend' as never };
      mockModel.findOneAndUpdate.mockResolvedValue(data);

      await service.upsertInsight(data);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          adPlatform: null,
          industry: null,
        }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('getInsight', () => {
    it('should query with insightType and valid date filter', async () => {
      const query = createMockQuery(null);
      mockModel.findOne.mockReturnValue(query);

      await service.getInsight('benchmark' as never);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          insightType: 'benchmark',
          isDeleted: false,
          validUntil: expect.objectContaining({ $gte: expect.any(Date) }),
        }),
      );
    });

    it('should apply adPlatform filter when provided', async () => {
      const query = createMockQuery(null);
      mockModel.findOne.mockReturnValue(query);

      await service.getInsight('trend' as never, { adPlatform: 'tiktok' });

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ adPlatform: 'tiktok' }),
      );
    });

    it('should apply industry filter when provided', async () => {
      const query = createMockQuery(null);
      mockModel.findOne.mockReturnValue(query);

      await service.getInsight('benchmark' as never, { industry: 'fintech' });

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ industry: 'fintech' }),
      );
    });

    it('should not apply optional filters when not provided', async () => {
      const query = createMockQuery(null);
      mockModel.findOne.mockReturnValue(query);

      await service.getInsight('benchmark' as never, {});

      const callArg = mockModel.findOne.mock.calls[0][0];
      expect(callArg).not.toHaveProperty('adPlatform');
      expect(callArg).not.toHaveProperty('industry');
    });

    it('should sort by computedAt descending', async () => {
      const query = createMockQuery(null);
      mockModel.findOne.mockReturnValue(query);

      await service.getInsight('trend' as never);

      expect(query.sort).toHaveBeenCalledWith({ computedAt: -1 });
    });

    it('should return the found insight', async () => {
      const insight = { _id: 'id-1', insightType: 'benchmark' };
      const query = createMockQuery(insight);
      mockModel.findOne.mockReturnValue(query);

      const result = await service.getInsight('benchmark' as never);

      expect(result).toEqual(insight);
    });
  });

  describe('getInsightsByType', () => {
    it('should query all active insights by type', async () => {
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.getInsightsByType('trend' as never);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          insightType: 'trend',
          isDeleted: false,
          validUntil: expect.objectContaining({ $gte: expect.any(Date) }),
        }),
      );
    });

    it('should return array of insights', async () => {
      const insights = [{ insightType: 'trend' }, { insightType: 'trend' }];
      const query = createMockQuery(insights);
      mockModel.find.mockReturnValue(query);

      const result = await service.getInsightsByType('trend' as never);

      expect(result).toEqual(insights);
    });
  });

  describe('removeExpired', () => {
    it('should delete records where validUntil is in the past', async () => {
      mockModel.deleteMany.mockResolvedValue({ deletedCount: 4 });

      const result = await service.removeExpired();

      expect(mockModel.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          validUntil: expect.objectContaining({ $lt: expect.any(Date) }),
        }),
      );
      expect(result).toBe(4);
    });

    it('should return 0 when no expired records exist', async () => {
      mockModel.deleteMany.mockResolvedValue({ deletedCount: 0 });

      const result = await service.removeExpired();

      expect(result).toBe(0);
    });
  });
});
