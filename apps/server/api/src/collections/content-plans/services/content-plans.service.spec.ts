import { ContentPlan } from '@api/collections/content-plans/schemas/content-plan.schema';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ContentPlanStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentPlansService', () => {
  let service: ContentPlansService;
  let model: Record<string, ReturnType<typeof vi.fn>>;

  const orgId = new Types.ObjectId().toString();
  const brandId = new Types.ObjectId().toString();
  const planId = new Types.ObjectId().toString();

  const mockPlan = {
    _id: new Types.ObjectId(planId),
    brand: new Types.ObjectId(brandId),
    createdBy: new Types.ObjectId(),
    description: 'Test plan',
    executedCount: 0,
    isDeleted: false,
    itemCount: 10,
    name: 'Q1 Content Plan',
    organization: new Types.ObjectId(orgId),
    periodEnd: new Date('2026-03-31'),
    periodStart: new Date('2026-01-01'),
    status: ContentPlanStatus.DRAFT,
  };

  beforeEach(async () => {
    model = {
      aggregate: vi.fn(),
      aggregatePaginate: vi.fn(),
      create: vi.fn().mockResolvedValue(mockPlan),
      deleteMany: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      updateMany: vi.fn(),
      updateOne: vi.fn(),
    } as Record<string, ReturnType<typeof vi.fn>>;

    // Support BaseService constructor pattern
    const modelConstructor: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockImplementation((dto) => ({
        ...dto,
        save: vi.fn().mockResolvedValue({ ...mockPlan, ...dto }),
      }));
    Object.assign(modelConstructor, model);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentPlansService,
        {
          provide: getModelToken(ContentPlan.name, DB_CONNECTIONS.CLOUD),
          useValue: modelConstructor,
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

    service = module.get<ContentPlansService>(ContentPlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInternal', () => {
    it('should create a content plan via model.create', async () => {
      const input = {
        brand: new Types.ObjectId(brandId),
        createdBy: new Types.ObjectId(),
        description: 'Internal plan',
        isDeleted: false,
        itemCount: 5,
        name: 'Auto Plan',
        organization: new Types.ObjectId(orgId),
        periodEnd: new Date(),
        periodStart: new Date(),
        status: ContentPlanStatus.DRAFT,
      };

      await service.createInternal(input);

      expect(model.create).toHaveBeenCalledWith(input);
    });

    it('should return the created document', async () => {
      const input = {
        brand: new Types.ObjectId(brandId),
        createdBy: new Types.ObjectId(),
        isDeleted: false,
        itemCount: 3,
        name: 'Test',
        organization: new Types.ObjectId(orgId),
        periodEnd: new Date(),
        periodStart: new Date(),
        status: ContentPlanStatus.DRAFT,
      };

      const result = await service.createInternal(input);
      expect(result).toEqual(mockPlan);
    });
  });

  describe('listByBrand', () => {
    it('should call find with organization, brand, and isDeleted filters', async () => {
      vi.spyOn(service, 'find').mockResolvedValue([mockPlan] as never);

      await service.listByBrand(orgId, brandId);

      expect(service.find).toHaveBeenCalledWith({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      });
    });

    it('should return array of plans', async () => {
      vi.spyOn(service, 'find').mockResolvedValue([mockPlan] as never);

      const result = await service.listByBrand(orgId, brandId);
      expect(result).toEqual([mockPlan]);
    });
  });

  describe('getByIdOrFail', () => {
    it('should return plan when found with org scoping', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(mockPlan as never);

      const result = await service.getByIdOrFail(orgId, planId);

      expect(service.findOne).toHaveBeenCalledWith({
        _id: new Types.ObjectId(planId),
        isDeleted: false,
        organization: new Types.ObjectId(orgId),
      });
      expect(result).toEqual(mockPlan);
    });

    it('should throw NotFoundException when plan not found', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue(null as never);

      await expect(service.getByIdOrFail(orgId, planId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status with organization scoping', async () => {
      model.findOneAndUpdate.mockResolvedValue({
        ...mockPlan,
        status: ContentPlanStatus.ACTIVE,
      });

      const result = await service.updateStatus(
        orgId,
        planId,
        ContentPlanStatus.ACTIVE,
      );

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(planId),
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
        },
        { $set: { status: ContentPlanStatus.ACTIVE } },
        { new: true },
      );
      expect(result.status).toBe(ContentPlanStatus.ACTIVE);
    });

    it('should throw NotFoundException when plan not found', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateStatus(orgId, planId, ContentPlanStatus.ACTIVE),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('incrementExecutedCount', () => {
    it('should increment executedCount with organization scoping', async () => {
      model.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await service.incrementExecutedCount(orgId, planId);

      expect(model.updateOne).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(planId),
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
        },
        { $inc: { executedCount: 1 } },
      );
    });
  });

  describe('softDelete', () => {
    it('should set isDeleted to true with organization scoping', async () => {
      model.findOneAndUpdate.mockResolvedValue({
        ...mockPlan,
        isDeleted: true,
      });

      const result = await service.softDelete(orgId, planId);

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: new Types.ObjectId(planId),
          isDeleted: false,
          organization: new Types.ObjectId(orgId),
        },
        { $set: { isDeleted: true } },
        { new: true },
      );
      expect(result.isDeleted).toBe(true);
    });

    it('should throw NotFoundException when plan not found', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);

      await expect(service.softDelete(orgId, planId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
