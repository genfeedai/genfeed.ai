import { DistributionEntity } from '@api/collections/distributions/entities/distribution.entity';
import { DistributionsService } from '@api/collections/distributions/services/distributions.service';
import {
  DistributionContentType,
  DistributionPlatform,
  PublishStatus,
} from '@genfeedai/enums';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function createMockModel() {
  const mockDoc = {
    _id: 'test-object-id',
    chatId: '-1001234567890',
    contentType: DistributionContentType.TEXT,
    isDeleted: false,
    organization: 'test-object-id',
    platform: DistributionPlatform.TELEGRAM,
    save: vi.fn(),
    status: PublishStatus.PUBLISHING,
    text: 'Hello from Genfeed',
    user: 'test-object-id',
  };

  const model = vi.fn();

  Object.assign(model, {
    aggregate: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([mockDoc]),
    }),
    aggregatePaginate: vi.fn().mockResolvedValue({
      docs: [mockDoc],
      hasNextPage: false,
      hasPrevPage: false,
      limit: 20,
      nextPage: null,
      page: 1,
      pagingCounter: 1,
      prevPage: null,
      totalDocs: 1,
      totalPages: 1,
    }),
    collection: { name: 'distributions' },
    findById: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDoc),
      }),
    }),
    findByIdAndUpdate: vi.fn().mockReturnValue({
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDoc),
      }),
    }),
    findOne: vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue(mockDoc),
      populate: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDoc),
      }),
    }),
    modelName: 'Distribution',
  });

  return { mockDoc, model };
}

function createMockLogger() {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
}

describe('DistributionsService', () => {
  let service: DistributionsService;
  let mockModel: ReturnType<typeof createMockModel>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockModel = createMockModel();
    logger = createMockLogger();
    service = new DistributionsService(
      mockModel.model as never,
      logger as never,
    );
  });

  describe('createDistribution', () => {
    it('should create a distribution with correct fields', async () => {
      const orgId = 'test-object-id';
      const userId = 'test-object-id';

      const createSpy = vi
        .spyOn(service, 'create')
        .mockResolvedValue(mockModel.mockDoc as never);

      const result = await service.createDistribution(
        orgId,
        userId,
        {
          chatId: '-1001234567890',
          contentType: DistributionContentType.TEXT,
          text: 'Hello',
        },
        DistributionPlatform.TELEGRAM,
      );

      expect(result).toBeDefined();
      expect(result._id).toEqual(mockModel.mockDoc._id);
      expect(createSpy).toHaveBeenCalledOnce();

      const entity = createSpy.mock.calls[0][0];
      expect(entity).toBeInstanceOf(DistributionEntity);
    });
  });

  describe('findByOrganization', () => {
    it('should query with organization filter', async () => {
      const orgId = 'test-object-id';

      const result = await service.findByOrganization(orgId);

      expect(result.docs).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should include platform filter when provided', async () => {
      const orgId = 'test-object-id';

      const result = await service.findByOrganization(orgId, {
        platform: DistributionPlatform.TELEGRAM,
      });

      expect(result.docs).toHaveLength(1);
    });
  });

  describe('findOneByOrganization', () => {
    it('should return distribution when found', async () => {
      const id = 'test-object-id';
      const orgId = 'test-object-id';

      const result = await service.findOneByOrganization(id, orgId);

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when not found', async () => {
      const id = 'test-object-id';
      const orgId = 'test-object-id';

      // Override findOne to return null
      mockModel.model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(service.findOneByOrganization(id, orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAsPublished', () => {
    it('should update status to PUBLISHED with timestamp', async () => {
      const id = 'test-object-id';

      const result = await service.markAsPublished(id, '12345');

      expect(result).toBeDefined();
      expect(mockModel.model.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('markAsFailed', () => {
    it('should update status to FAILED with error message', async () => {
      const id = 'test-object-id';

      const result = await service.markAsFailed(id, 'Bot token revoked');

      expect(result).toBeDefined();
      expect(mockModel.model.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('cancelScheduled', () => {
    it('should cancel a scheduled distribution', async () => {
      const id = 'test-object-id';
      const orgId = 'test-object-id';

      // Mock findOne to return a scheduled distribution
      mockModel.model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...mockModel.mockDoc,
          status: PublishStatus.SCHEDULED,
        }),
      });

      const result = await service.cancelScheduled(id, orgId);

      expect(result).toBeDefined();
    });

    it('should throw when distribution is not scheduled', async () => {
      const id = 'test-object-id';
      const orgId = 'test-object-id';

      // Mock findOne to return a published distribution
      mockModel.model.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...mockModel.mockDoc,
          status: PublishStatus.PUBLISHED,
        }),
      });

      await expect(service.cancelScheduled(id, orgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
