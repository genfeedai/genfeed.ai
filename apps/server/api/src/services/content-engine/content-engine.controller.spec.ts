import type { AuthenticatedUser as User } from '@server/auth/interfaces/authenticated-user.interface';
import { ContentPlanItemsService } from '@server/collections/content-plan-items/services/content-plan-items.service';
import { ContentPlansService } from '@server/collections/content-plans/services/content-plans.service';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentExecutionService } from '@server/services/content-engine/content-execution.service';
import { ContentPlannerService } from '@server/services/content-engine/content-planner.service';
import { testId } from '@helpers/testing/test-id.helper';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  const orgId = testId('org');
  const userId = testId('user');

  const mockUser = {
    id: 'user_123',
    organizationId: orgId,
    userId: userId,
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
              .mockResolvedValue({ id: 'plan-1', status: 'draft' }),
          },
        },
        {
          provide: ContentPlansService,
          useValue: {
            getByIdOrFail: vi
              .fn()
              .mockResolvedValue({ id: 'plan-1', status: 'draft' }),
            listByBrand: vi
              .fn()
              .mockResolvedValue([{ id: 'plan-1' }, { id: 'plan-2' }]),
            patch: vi
              .fn()
              .mockResolvedValue({ id: 'plan-1', status: 'updated' }),
            softDelete: vi.fn().mockResolvedValue({ acknowledged: true }),
          },
        },
        {
          provide: ContentPlanItemsService,
          useValue: {
            listByPlan: vi
              .fn()
              .mockResolvedValue([{ id: 'item-1' }, { id: 'item-2' }]),
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
      ],
    }).compile();

    controller = module.get(ContentEngineController);
    contentPlannerService = module.get(ContentPlannerService);
    contentPlansService = module.get(ContentPlansService);
    contentPlanItemsService = module.get(ContentPlanItemsService);
    contentExecutionService = module.get(ContentExecutionService);
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
      expect(result).toEqual({ data: { id: 'plan-1', status: 'draft' } });
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
        data: [{ id: 'plan-1' }, { id: 'plan-2' }],
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
        organizationId: orgId,
      });
      expect(result).toEqual({
        data: { id: 'plan-1', status: 'updated' },
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
});
