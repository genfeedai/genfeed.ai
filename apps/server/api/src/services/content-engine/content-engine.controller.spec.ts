import { ContentPlanItemsService } from '@api/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlansService } from '@api/collections/content-plans/services/content-plans.service';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentExecutionService } from '@api/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@api/services/content-engine/content-planner.service';
import { ContentReviewService } from '@api/services/content-engine/content-review.service';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data: data.docs })),
  serializeSingle: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data })),
}));

describe('ContentEngineController', () => {
  let controller: ContentEngineController;
  let contentPlannerService: {
    generatePlan: ReturnType<typeof vi.fn>;
  };
  let contentPlansService: {
    getByIdOrFail: ReturnType<typeof vi.fn>;
    listByBrand: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    softDelete: ReturnType<typeof vi.fn>;
  };
  let contentPlanItemsService: {
    listByPlan: ReturnType<typeof vi.fn>;
    softDeleteByPlan: ReturnType<typeof vi.fn>;
  };
  let contentExecutionService: {
    executePlan: ReturnType<typeof vi.fn>;
    executeSingleItem: ReturnType<typeof vi.fn>;
  };
  let contentReviewService: {
    approveDraft: ReturnType<typeof vi.fn>;
    bulkApprove: ReturnType<typeof vi.fn>;
    getQueue: ReturnType<typeof vi.fn>;
    rejectDraft: ReturnType<typeof vi.fn>;
  };

  const orgId = '507f1f77bcf86cd799439012';
  const userId = '507f1f77bcf86cd799439011';

  const mockUser = {
    id: 'user_123',
    publicMetadata: { organization: orgId, user: userId },
  } as unknown as User;

  const mockReq = {
    headers: {},
    url: '/brands/brand-1/content',
  } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentEngineController],
      providers: [
        {
          provide: ContentPlannerService,
          useValue: {
            generatePlan: vi
              .fn()
              .mockResolvedValue({ _id: 'plan-1', status: 'draft' }),
          },
        },
        {
          provide: ContentPlansService,
          useValue: {
            getByIdOrFail: vi
              .fn()
              .mockResolvedValue({ _id: 'plan-1', status: 'draft' }),
            listByBrand: vi
              .fn()
              .mockResolvedValue([{ _id: 'plan-1' }, { _id: 'plan-2' }]),
            patch: vi
              .fn()
              .mockResolvedValue({ _id: 'plan-1', status: 'updated' }),
            softDelete: vi.fn().mockResolvedValue({ acknowledged: true }),
          },
        },
        {
          provide: ContentPlanItemsService,
          useValue: {
            listByPlan: vi
              .fn()
              .mockResolvedValue([{ _id: 'item-1' }, { _id: 'item-2' }]),
            softDeleteByPlan: vi.fn().mockResolvedValue({ acknowledged: true }),
          },
        },
        {
          provide: ContentExecutionService,
          useValue: {
            executePlan: vi
              .fn()
              .mockResolvedValue({ jobId: 'job-1', status: 'queued' }),
            executeSingleItem: vi
              .fn()
              .mockResolvedValue({ jobId: 'job-2', status: 'queued' }),
          },
        },
        {
          provide: ContentReviewService,
          useValue: {
            approveDraft: vi
              .fn()
              .mockResolvedValue({ _id: 'draft-1', status: 'approved' }),
            bulkApprove: vi.fn().mockResolvedValue([
              { _id: 'draft-1', status: 'approved' },
              { _id: 'draft-2', status: 'approved' },
            ]),
            getQueue: vi
              .fn()
              .mockResolvedValue([{ _id: 'draft-1' }, { _id: 'draft-2' }]),
            rejectDraft: vi
              .fn()
              .mockResolvedValue({ _id: 'draft-1', status: 'rejected' }),
          },
        },
      ],
    }).compile();

    controller = module.get(ContentEngineController);
    contentPlannerService = module.get(ContentPlannerService);
    contentPlansService = module.get(ContentPlansService);
    contentPlanItemsService = module.get(ContentPlanItemsService);
    contentExecutionService = module.get(ContentExecutionService);
    contentReviewService = module.get(ContentReviewService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── Plans ──────────────────────────────────────────────────────────

  describe('generatePlan', () => {
    it('should generate a plan scoped to organization and brand', async () => {
      const dto = { topics: ['AI'] } as never;
      const result = await controller.generatePlan(
        mockReq,
        mockUser,
        'brand-1',
        dto,
      );

      expect(contentPlannerService.generatePlan).toHaveBeenCalledWith(
        orgId,
        'brand-1',
        userId,
        dto,
      );
      expect(result).toEqual({ data: { _id: 'plan-1', status: 'draft' } });
    });
  });

  describe('listPlans', () => {
    it('should list plans by brand with organization scope', async () => {
      const result = await controller.listPlans(mockReq, mockUser, 'brand-1');

      expect(contentPlansService.listByBrand).toHaveBeenCalledWith(
        orgId,
        'brand-1',
      );
      expect(result).toEqual({
        data: [{ _id: 'plan-1' }, { _id: 'plan-2' }],
      });
    });
  });

  describe('getPlan', () => {
    it('should return plan with its items', async () => {
      const result = await controller.getPlan(mockReq, mockUser, 'plan-1');

      expect(contentPlansService.getByIdOrFail).toHaveBeenCalledWith(
        orgId,
        'plan-1',
      );
      expect(contentPlanItemsService.listByPlan).toHaveBeenCalledWith(
        orgId,
        'plan-1',
      );
      expect(result).toHaveProperty('plan');
      expect(result).toHaveProperty('items');
    });
  });

  describe('updatePlan', () => {
    it('should patch a plan with organization context', async () => {
      const dto = { title: 'Updated Plan' } as never;
      const result = await controller.updatePlan(
        mockReq,
        mockUser,
        'plan-1',
        dto,
      );

      expect(contentPlansService.patch).toHaveBeenCalledWith('plan-1', {
        ...dto,
        organization: orgId,
      });
      expect(result).toEqual({
        data: { _id: 'plan-1', status: 'updated' },
      });
    });
  });

  describe('deletePlan', () => {
    it('should soft-delete plan items and then the plan', async () => {
      await controller.deletePlan(mockUser, 'plan-1');

      expect(contentPlanItemsService.softDeleteByPlan).toHaveBeenCalledWith(
        orgId,
        'plan-1',
      );
      expect(contentPlansService.softDelete).toHaveBeenCalledWith(
        orgId,
        'plan-1',
      );
    });
  });

  // ── Execution ──────────────────────────────────────────────────────

  describe('executePlan', () => {
    it('should execute a plan with org, brand, plan, and user ids', () => {
      const result = controller.executePlan(mockUser, 'brand-1', 'plan-1');

      expect(contentExecutionService.executePlan).toHaveBeenCalledWith(
        orgId,
        'brand-1',
        'plan-1',
        userId,
      );
      expect(result).toBeDefined();
    });
  });

  describe('executeItem', () => {
    it('should execute a single item with org, brand, user, and item ids', () => {
      const result = controller.executeItem(mockUser, 'brand-1', 'item-1');

      expect(contentExecutionService.executeSingleItem).toHaveBeenCalledWith(
        orgId,
        'brand-1',
        userId,
        'item-1',
      );
      expect(result).toBeDefined();
    });
  });

  // ── Review Queue ───────────────────────────────────────────────────

  describe('getQueue', () => {
    it('should return review queue scoped to org and brand', async () => {
      const result = await controller.getQueue(mockReq, mockUser, 'brand-1');

      expect(contentReviewService.getQueue).toHaveBeenCalledWith(
        orgId,
        'brand-1',
      );
      expect(result).toEqual({
        data: [{ _id: 'draft-1' }, { _id: 'draft-2' }],
      });
    });
  });

  describe('approveDraft', () => {
    it('should approve a draft with org and user context', async () => {
      const result = await controller.approveDraft(
        mockReq,
        mockUser,
        'draft-1',
      );

      expect(contentReviewService.approveDraft).toHaveBeenCalledWith(
        orgId,
        'draft-1',
        userId,
      );
      expect(result).toEqual({
        data: { _id: 'draft-1', status: 'approved' },
      });
    });
  });

  describe('rejectDraft', () => {
    it('should reject a draft with reason', async () => {
      const dto = { reason: 'Off-brand' };
      const result = await controller.rejectDraft(
        mockReq,
        mockUser,
        'draft-1',
        dto as never,
      );

      expect(contentReviewService.rejectDraft).toHaveBeenCalledWith(
        orgId,
        'draft-1',
        'Off-brand',
      );
      expect(result).toEqual({
        data: { _id: 'draft-1', status: 'rejected' },
      });
    });
  });

  describe('bulkApproveDrafts', () => {
    it('should bulk approve multiple drafts', async () => {
      const dto = { ids: ['draft-1', 'draft-2'] };
      const result = await controller.bulkApproveDrafts(
        mockReq,
        mockUser,
        dto as never,
      );

      expect(contentReviewService.bulkApprove).toHaveBeenCalledWith(
        orgId,
        ['draft-1', 'draft-2'],
        userId,
      );
      expect(result).toEqual({
        data: [
          { _id: 'draft-1', status: 'approved' },
          { _id: 'draft-2', status: 'approved' },
        ],
      });
    });
  });
});
