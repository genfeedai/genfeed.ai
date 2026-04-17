import {
  ContentPlanItemsService,
  type CreateContentPlanItemInput,
} from '@api/collections/content-plan-items/services/content-plan-items.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ContentPlanItemStatus } from '@genfeedai/enums';
import { type ContentPlanItem } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ContentPlanItemsService', () => {
  const orgId = 'test-object-id'.toString();
  const planId = 'test-object-id'.toString();
  const brandId = 'test-object-id'.toString();
  const itemId = 'test-object-id'.toString();

  let service: ContentPlanItemsService;
  let model: {
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const buildFindChain = (returnValue: unknown) => ({
    exec: vi.fn().mockResolvedValue(returnValue),
    sort: vi.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    const modelMock = {
      create: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      updateMany: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentPlanItemsService,
        { provide: PrismaService, useValue: modelMock },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get(ContentPlanItemsService);
    model = module.get(PrismaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createMany', () => {
    it('should create docs with PENDING status and ObjectId fields', async () => {
      const items: CreateContentPlanItemInput[] = [
        {
          brand: brandId,
          organization: orgId,
          plan: planId,
          platforms: ['instagram'],
          topic: 'AI trends',
          type: 'video',
        },
      ];

      const created = [
        { _id: 'test-object-id', status: ContentPlanItemStatus.PENDING },
      ];
      model.create.mockResolvedValue(created);

      const result = await service.createMany(items);

      expect(model.create).toHaveBeenCalledOnce();
      const docs = model.create.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(docs[0].status).toBe(ContentPlanItemStatus.PENDING);
      expect(docs[0].isDeleted).toBe(false);
      expect(docs[0].pipelineSteps).toEqual([]);
      expect(result).toBe(created);
    });

    it('should pass optional fields through when provided', async () => {
      const items: CreateContentPlanItemInput[] = [
        {
          brand: brandId,
          confidence: 0.9,
          organization: orgId,
          pipelineSteps: [{ model: 'gpt-4', type: 'text' }],
          plan: planId,
          platforms: ['tiktok'],
          prompt: 'Write about AI',
          scheduledAt: new Date('2026-03-20'),
          skillSlug: 'content-writing',
          topic: 'AI',
          type: 'reel',
        },
      ];
      model.create.mockResolvedValue([{}]);

      await service.createMany(items);

      const docs = model.create.mock.calls[0][0] as Array<
        Record<string, unknown>
      >;
      expect(docs[0].confidence).toBe(0.9);
      expect(docs[0].skillSlug).toBe('content-writing');
      expect(docs[0].pipelineSteps).toHaveLength(1);
      expect((docs[0].scheduledAt as Date).toISOString()).toContain(
        '2026-03-20',
      );
    });
  });

  describe('listByPlan', () => {
    it('should query with org + plan ObjectIds and sort by scheduledAt', async () => {
      const mockItems = [{ _id: itemId, topic: 'Topic A' }];
      model.find.mockReturnValue(buildFindChain(mockItems));

      const result = await service.listByPlan(orgId, planId);

      expect(model.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
      expect(result).toEqual(mockItems);
    });

    it('should return empty array when no items exist', async () => {
      model.find.mockReturnValue(buildFindChain([]));

      const result = await service.listByPlan(orgId, planId);

      expect(result).toEqual([]);
    });
  });

  describe('listPendingByPlan', () => {
    it('should filter by PENDING status', async () => {
      const mockItems = [{ status: ContentPlanItemStatus.PENDING }];
      model.find.mockReturnValue(buildFindChain(mockItems));

      await service.listPendingByPlan(orgId, planId);

      const query = model.find.mock.calls[0][0] as Record<string, unknown>;
      expect(query.status).toBe(ContentPlanItemStatus.PENDING);
    });
  });

  describe('getByIdOrFail', () => {
    it('should return item when found', async () => {
      const mockItem = { _id: itemId, topic: 'Found' };
      model.findOne.mockResolvedValue(mockItem);

      const result = await service.getByIdOrFail(orgId, itemId);

      expect(result).toEqual(mockItem);
    });

    it('should throw NotFoundException when item not found', async () => {
      model.findOne.mockResolvedValue(null);

      await expect(service.getByIdOrFail(orgId, itemId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status and return updated document', async () => {
      const updated = { _id: itemId, status: ContentPlanItemStatus.COMPLETED };
      model.findOneAndUpdate.mockResolvedValue(updated);

      const result = await service.updateStatus(
        orgId,
        itemId,
        ContentPlanItemStatus.COMPLETED,
      );

      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: ContentPlanItemStatus.COMPLETED,
          }),
        }),
        { new: true },
      );
      expect(result).toEqual(updated);
    });

    it('should include contentDraftId in $set when provided', async () => {
      const updated = { _id: itemId, status: ContentPlanItemStatus.COMPLETED };
      model.findOneAndUpdate.mockResolvedValue(updated);

      await service.updateStatus(
        orgId,
        itemId,
        ContentPlanItemStatus.COMPLETED,
        {
          contentDraftId: 'draft_abc',
        },
      );

      const setArg = model.findOneAndUpdate.mock.calls[0][1] as {
        $set: Record<string, unknown>;
      };
      expect(setArg.$set.contentDraftId).toBe('draft_abc');
    });

    it('should include error string in $set when provided', async () => {
      const updated = { _id: itemId, status: ContentPlanItemStatus.FAILED };
      model.findOneAndUpdate.mockResolvedValue(updated);

      await service.updateStatus(orgId, itemId, ContentPlanItemStatus.FAILED, {
        error: 'Something went wrong',
      });

      const setArg = model.findOneAndUpdate.mock.calls[0][1] as {
        $set: Record<string, unknown>;
      };
      expect(setArg.$set.error).toBe('Something went wrong');
    });

    it('should throw NotFoundException when document not found during update', async () => {
      model.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateStatus(orgId, itemId, ContentPlanItemStatus.FAILED),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include confidence when it is zero (falsy edge case)', async () => {
      const updated = { _id: itemId, confidence: 0 };
      model.findOneAndUpdate.mockResolvedValue(updated);

      await service.updateStatus(orgId, itemId, ContentPlanItemStatus.PENDING, {
        confidence: 0,
      });

      const setArg = model.findOneAndUpdate.mock.calls[0][1] as {
        $set: Record<string, unknown>;
      };
      expect(setArg.$set.confidence).toBe(0);
    });
  });

  describe('softDeleteByPlan', () => {
    it('should set isDeleted: true for all plan items', async () => {
      model.updateMany.mockResolvedValue({ modifiedCount: 3 });

      await service.softDeleteByPlan(orgId, planId);

      expect(model.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
        { $set: { isDeleted: true } },
      );
    });

    it('should resolve without error even if no documents matched', async () => {
      model.updateMany.mockResolvedValue({ modifiedCount: 0 });

      await expect(
        service.softDeleteByPlan(orgId, planId),
      ).resolves.toBeUndefined();
    });
  });
});
