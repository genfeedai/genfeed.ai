import { AdOptimizationRecommendation } from '@api/collections/ad-optimization-recommendations/schemas/ad-optimization-recommendation.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { AdOptimizationRecommendationsService } from './ad-optimization-recommendations.service';

describe('AdOptimizationRecommendationsService', () => {
  let service: AdOptimizationRecommendationsService;

  const createMockQuery = (resolvedValue: unknown = null) => {
    const query = {
      exec: vi.fn().mockResolvedValue(resolvedValue),
      lean: vi.fn(),
      limit: vi.fn(),
      skip: vi.fn(),
      sort: vi.fn(),
    };
    query.lean.mockReturnValue(query);
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    return query;
  };

  let mockModel: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    insertMany: ReturnType<typeof vi.fn>;
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
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      insertMany: vi.fn(),
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
        AdOptimizationRecommendationsService,
        { provide: PrismaService, useValue: mockModel },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AdOptimizationRecommendationsService>(
      AdOptimizationRecommendationsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createBatch', () => {
    it('should insert multiple recommendations and return the count', async () => {
      const recs: Partial<AdOptimizationRecommendation>[] = [
        { recommendationType: 'budget_increase' as never },
        { recommendationType: 'pause_ad' as never },
      ];
      mockModel.insertMany.mockResolvedValue([{}, {}]);

      const result = await service.createBatch(recs);

      expect(mockModel.insertMany).toHaveBeenCalledWith(recs, {
        ordered: false,
      });
      expect(result).toBe(2);
    });

    it('should log success after batch insert', async () => {
      mockModel.insertMany.mockResolvedValue([{}]);
      await service.createBatch([
        { recommendationType: 'budget_increase' as never },
      ]);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('created 1 recommendations'),
      );
    });

    it('should propagate and log errors from insertMany', async () => {
      const error = new Error('Write conflict');
      mockModel.insertMany.mockRejectedValue(error);

      await expect(service.createBatch([])).rejects.toThrow('Write conflict');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findByOrganization', () => {
    it('should apply status filter when provided', async () => {
      const orgId = 'test-object-id'.toString();
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findByOrganization(orgId, { status: 'pending' });

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('should default to limit 50 and offset 0', async () => {
      const orgId = 'test-object-id'.toString();
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findByOrganization(orgId);

      expect(query.skip).toHaveBeenCalledWith(0);
      expect(query.limit).toHaveBeenCalledWith(50);
    });

    it('should include isDeleted: false in query', async () => {
      const orgId = 'test-object-id'.toString();
      const query = createMockQuery([]);
      mockModel.find.mockReturnValue(query);

      await service.findByOrganization(orgId);

      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });
  });

  describe('findById', () => {
    it('should query by id with organization isolation', async () => {
      const id = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      const query = createMockQuery(null);
      mockModel.findOne.mockReturnValue(query);

      await service.findById(id, orgId);

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: expect.any(string),
          isDeleted: false,
          organization: expect.any(string),
        }),
      );
    });
  });

  describe('approve', () => {
    it('should update status to approved from pending', async () => {
      const id = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      const approved = { _id: id, status: 'approved' };
      // findOneAndUpdate returns the updated doc
      mockModel.findOneAndUpdate.mockReturnValue(createMockQuery(approved));

      const result = await service.approve(id, orgId);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
        { $set: { status: 'approved' } },
        { new: true },
      );
      expect(result).toEqual(approved);
    });

    it('should throw ConflictException if status is not pending', async () => {
      const id = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      // findOneAndUpdate returns null (wrong state), findOne returns existing
      mockModel.findOneAndUpdate.mockReturnValue(createMockQuery(null));
      mockModel.findOne.mockReturnValue(
        createMockQuery({ _id: id, status: 'rejected' }),
      );

      await expect(service.approve(id, orgId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should return null if document does not exist', async () => {
      const id = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      mockModel.findOneAndUpdate.mockReturnValue(createMockQuery(null));
      mockModel.findOne.mockReturnValue(createMockQuery(null));

      const result = await service.approve(id, orgId);
      expect(result).toBeNull();
    });
  });

  describe('reject', () => {
    it('should update status to rejected from pending', async () => {
      const id = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      mockModel.findOneAndUpdate.mockReturnValue(
        createMockQuery({ _id: id, status: 'rejected' }),
      );

      await service.reject(id, orgId);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
        { $set: { status: 'rejected' } },
        { new: true },
      );
    });
  });

  describe('markExecuted', () => {
    it('should update status to executed from approved', async () => {
      const id = 'test-object-id'.toString();
      const orgId = 'test-object-id'.toString();
      mockModel.findOneAndUpdate.mockReturnValue(
        createMockQuery({ _id: id, status: 'executed' }),
      );

      await service.markExecuted(id, orgId);

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'approved' }),
        { $set: { status: 'executed' } },
        { new: true },
      );
    });
  });

  describe('expireStale', () => {
    it('should update pending records past expiry date to expired', async () => {
      mockModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      const result = await service.expireStale();

      expect(mockModel.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: expect.objectContaining({ $lte: expect.any(Date) }),
          isDeleted: false,
          status: 'pending',
        }),
        { $set: { status: 'expired' } },
      );
      expect(result).toBe(3);
    });

    it('should return 0 when no stale records exist', async () => {
      mockModel.updateMany.mockResolvedValue({ modifiedCount: 0 });

      const result = await service.expireStale();
      expect(result).toBe(0);
    });

    it('should log when records are expired', async () => {
      mockModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

      await service.expireStale();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('expired 2 stale recommendations'),
      );
    });
  });

  describe('findExistingPending', () => {
    it('should query by entityId, recommendationType, and pending status', async () => {
      const orgId = 'test-object-id'.toString();
      const query = createMockQuery(null);
      mockModel.findOne.mockReturnValue(query);

      await service.findExistingPending(
        orgId,
        'ad-123',
        'budget_increase' as never,
      );

      expect(mockModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'ad-123',
          isDeleted: false,
          recommendationType: 'budget_increase',
          status: 'pending',
        }),
      );
    });
  });
});
