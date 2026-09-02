import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationWorkflowService } from '@api/services/batch-generation/batch-generation-workflow.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  serializeSingle: vi.fn((_, __, data) => data),
}));

describe('BatchGenerationController', () => {
  let controller: BatchGenerationController;
  let service: vi.Mocked<BatchGenerationService>;
  let workflowService: { queueBatch: ReturnType<typeof vi.fn> };

  const mockReq = {} as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchGenerationController],
      providers: [
        {
          provide: MembersService,
          useValue: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() },
        },
        {
          provide: BatchGenerationService,
          useValue: {
            approveItems: vi.fn(),
            assignItem: vi.fn(),
            cancelBatch: vi.fn(),
            createBatch: vi.fn(),
            createManualReviewBatch: vi.fn(),
            getBatch: vi.fn(),
            getBatches: vi.fn(),
            processBatch: vi.fn(),
            rejectItems: vi.fn(),
            requestChanges: vi.fn(),
            unassignItem: vi.fn(),
            updateBatch: vi.fn(),
          },
        },
        {
          provide: BatchGenerationWorkflowService,
          useValue: {
            queueBatch: vi.fn().mockResolvedValue('job-1'),
          },
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
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BatchGenerationController>(
      BatchGenerationController,
    );
    service = module.get(BatchGenerationService);
    workflowService = module.get(BatchGenerationWorkflowService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createBatch', () => {
    it('should call service.createBatch', () => {
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      controller.createBatch(
        mockReq,
        { brandId: 'brand-1', count: 10 } as never,
        user,
      );
      expect(service.createBatch).toHaveBeenCalled();
    });
  });

  describe('createManualReviewBatch', () => {
    it('should call service.createManualReviewBatch', async () => {
      service.createManualReviewBatch.mockResolvedValue({
        id: 'batch-1',
        items: [],
      } as never);

      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;

      const result = await controller.createManualReviewBatch(
        mockReq,
        {
          brandId: 'test-object-id',
          items: [{ format: 'video' }],
        } as never,
        user,
      );

      expect(service.createManualReviewBatch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getBatches', () => {
    it('should call service.getBatches', async () => {
      service.getBatches.mockResolvedValue({ items: [], total: 0 } as never);
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      const result = await controller.getBatches(mockReq, {} as never, user);
      expect(service.getBatches).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getBatch', () => {
    it('should call service.getBatch with batchId', async () => {
      const batchDoc = { id: 'batch-1', status: 'completed' };
      service.getBatch.mockResolvedValue(batchDoc as never);
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      const result = await controller.getBatch(mockReq, 'batch-1', user);
      expect(service.getBatch).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('processBatch', () => {
    it('queues the batch workflow instead of processing inline', async () => {
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;

      const result = await controller.processBatch('batch-1', user);

      expect(workflowService.queueBatch).toHaveBeenCalledWith({
        batchId: 'batch-1',
        organizationId: 'org',
        userId: 'usr',
      });
      expect(service.processBatch).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
    });
  });

  describe('patch', () => {
    it('should delegate to service.updateBatch to cancel a batch', async () => {
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      (
        service as unknown as Record<string, ReturnType<typeof vi.fn>>
      ).updateBatch = vi.fn().mockResolvedValue({ status: 'CANCELLED' });

      const result = await controller.patch(
        mockReq,
        'batch-1',
        { status: 'CANCELLED' } as never,
        user,
      );
      expect(service.updateBatch).toHaveBeenCalledWith(
        'batch-1',
        { status: 'CANCELLED' },
        expect.any(String),
      );
      expect(result).toBeDefined();
    });
  });

  describe('itemAction', () => {
    it('passes the canonical user id when approving items', async () => {
      service.approveItems.mockResolvedValue({ id: 'batch-1' } as never);

      await controller.itemAction(
        mockReq,
        'batch-1',
        {
          action: 'approve',
          itemIds: ['item-1'],
        } as never,
        {
          brandId: 'test-object-id',
          id: 'auth-provider-user',
          organizationId: 'test-object-id',
          userId: 'test-object-id',
        } as never,
      );

      expect(service.approveItems).toHaveBeenCalledWith(
        'batch-1',
        ['item-1'],
        'test-object-id',
        'test-object-id',
      );
    });

    it('routes request_changes actions to the requestChanges service method', async () => {
      service.requestChanges.mockResolvedValue({ id: 'batch-1' } as never);

      const user = {
        brandId: 'test-object-id',
        id: 'auth-provider-user',
        organizationId: 'test-object-id',
        userId: 'test-object-id',
      } as never;

      await controller.itemAction(
        mockReq,
        'batch-1',
        {
          action: 'request_changes',
          feedback: 'Tighten the hook and shorten the caption.',
          itemIds: ['item-1'],
        } as never,
        user,
      );

      expect(service.requestChanges).toHaveBeenCalledWith(
        'batch-1',
        ['item-1'],
        'test-object-id',
        'Tighten the hook and shorten the caption.',
        'test-object-id',
      );
    });

    it('passes the canonical user id when rejecting items', async () => {
      service.rejectItems.mockResolvedValue({ id: 'batch-1' } as never);

      await controller.itemAction(
        mockReq,
        'batch-1',
        {
          action: 'reject',
          feedback: 'Not aligned with the brief.',
          itemIds: ['item-1'],
        } as never,
        {
          brandId: 'test-object-id',
          id: 'auth-provider-user',
          organizationId: 'test-object-id',
          userId: 'test-object-id',
        } as never,
      );

      expect(service.rejectItems).toHaveBeenCalledWith(
        'batch-1',
        ['item-1'],
        'test-object-id',
        'Not aligned with the brief.',
        'test-object-id',
      );
    });
  });

  describe('assignItem', () => {
    it('assigns with the canonical user id and organization', async () => {
      service.assignItem.mockResolvedValue({ id: 'batch-1' } as never);

      await controller.assignItem(
        mockReq,
        'batch-1',
        'item-1',
        { assigneeId: 'user-1' } as never,
        {
          organizationId: 'org-1',
          userId: 'actor-1',
        } as never,
      );

      expect(service.assignItem).toHaveBeenCalledWith(
        'batch-1',
        'item-1',
        'user-1',
        'org-1',
      );
    });
  });

  describe('unassignItem', () => {
    it('clears assignment for the tenant-scoped item', async () => {
      service.unassignItem.mockResolvedValue({ id: 'batch-1' } as never);

      await controller.unassignItem(mockReq, 'batch-1', 'item-1', {
        organizationId: 'org-1',
        userId: 'actor-1',
      } as never);

      expect(service.unassignItem).toHaveBeenCalledWith(
        'batch-1',
        'item-1',
        'org-1',
      );
    });
  });
});
