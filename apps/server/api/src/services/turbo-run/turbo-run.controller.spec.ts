import { MembersService } from '@api/collections/members/services/members.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TurboRunController } from '@api/services/turbo-run/turbo-run.controller';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { TurboRunRewriteService } from '@api/services/turbo-run/turbo-run-rewrite.service';
import { TurboRunWorkflowService } from '@api/services/turbo-run/turbo-run-workflow.service';
import { TurboRewriteCreditsGuard } from '@api/services/turbo-run/turbo-rewrite-credits.guard';
import { ActivitySource } from '@genfeedai/contracts';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_, __, { docs }) => docs),
  serializeSingle: vi.fn((_, __, data) => data),
}));

describe('TurboRunController', () => {
  let controller: TurboRunController;
  let service: vi.Mocked<TurboRunService>;
  let workflowService: { queueTurboRun: ReturnType<typeof vi.fn> };
  const rewriteService = {
    cancel: vi.fn(),
    enqueue: vi.fn(),
    getActiveJob: vi.fn(),
    getJob: vi.fn(),
  };

  const mockReq = {} as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TurboRunController],
      providers: [
        {
          provide: TurboRunRewriteService,
          useValue: rewriteService,
        },
        {
          provide: MembersService,
          useValue: { find: vi.fn().mockResolvedValue([]), findOne: vi.fn() },
        },
        {
          provide: TurboRunService,
          useValue: {
            approveItems: vi.fn(),
            assignItem: vi.fn(),
            cancelTurboRun: vi.fn(),
            createTurboRun: vi.fn(),
            createManualReviewTurboRun: vi.fn(),
            getTurboRun: vi.fn(),
            getTurboRuns: vi.fn(),
            processTurboRun: vi.fn(),
            rejectItems: vi.fn(),
            requestChanges: vi.fn(),
            unassignItem: vi.fn(),
            updateTurboRun: vi.fn(),
          },
        },
        {
          provide: TurboRunWorkflowService,
          useValue: {
            queueTurboRun: vi.fn().mockResolvedValue('job-1'),
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
      .overrideGuard(TurboRewriteCreditsGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TurboRunController>(
      TurboRunController,
    );
    service = module.get(TurboRunService);
    workflowService = module.get(TurboRunWorkflowService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createTurboRun', () => {
    it('should call service.createTurboRun', () => {
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      controller.createTurboRun(
        mockReq,
        { brandId: 'brand-1', count: 10 } as never,
        user,
      );
      expect(service.createTurboRun).toHaveBeenCalled();
    });
  });

  describe('createManualReviewTurboRun', () => {
    it('should call service.createManualReviewTurboRun', async () => {
      service.createManualReviewTurboRun.mockResolvedValue({
        id: 'run-1',
        items: [],
      } as never);

      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;

      const result = await controller.createManualReviewTurboRun(
        mockReq,
        {
          brandId: 'test-object-id',
          items: [{ format: 'video' }],
        } as never,
        user,
      );

      expect(service.createManualReviewTurboRun).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getTurboRuns', () => {
    it('should call service.getTurboRuns', async () => {
      service.getTurboRuns.mockResolvedValue({ items: [], total: 0 } as never);
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      const result = await controller.getTurboRuns(mockReq, {} as never, user);
      expect(service.getTurboRuns).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getTurboRun', () => {
    it('should call service.getTurboRun with turboRunId', async () => {
      const turboRunDoc = { id: 'run-1', status: 'completed' };
      service.getTurboRun.mockResolvedValue(turboRunDoc as never);
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      const result = await controller.getTurboRun(mockReq, 'run-1', user);
      expect(service.getTurboRun).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('processTurboRun', () => {
    it('queues the run workflow instead of processing inline', async () => {
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;

      const result = await controller.processTurboRun('run-1', user);

      expect(workflowService.queueTurboRun).toHaveBeenCalledWith(
        {
          turboRunId: 'run-1',
          organizationId: 'org',
          userId: 'usr',
        },
        SystemWorkflowDispatchClass.INTERACTIVE,
      );
      expect(service.processTurboRun).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 'job-1', status: 'queued' });
    });
  });

  describe('patch', () => {
    it('should delegate to service.updateTurboRun to cancel a run', async () => {
      const user = {
        id: 'user-123',
        organizationId: 'org',
        userId: 'usr',
      } as never;
      (
        service as unknown as Record<string, ReturnType<typeof vi.fn>>
      ).updateTurboRun = vi.fn().mockResolvedValue({ status: 'CANCELLED' });

      const result = await controller.patch(
        mockReq,
        'run-1',
        { status: 'CANCELLED' } as never,
        user,
      );
      expect(service.updateTurboRun).toHaveBeenCalledWith(
        'run-1',
        { status: 'CANCELLED' },
        expect.any(String),
      );
      expect(result).toBeDefined();
    });
  });

  describe('itemAction', () => {
    it('passes the canonical user id when approving items', async () => {
      service.approveItems.mockResolvedValue({ id: 'run-1' } as never);

      await controller.itemAction(
        mockReq,
        'run-1',
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
        'run-1',
        ['item-1'],
        'test-object-id',
        'test-object-id',
      );
    });

    it('routes request_changes actions to the requestChanges service method', async () => {
      service.requestChanges.mockResolvedValue({ id: 'run-1' } as never);

      const user = {
        brandId: 'test-object-id',
        id: 'auth-provider-user',
        organizationId: 'test-object-id',
        userId: 'test-object-id',
      } as never;

      await controller.itemAction(
        mockReq,
        'run-1',
        {
          action: 'request_changes',
          feedback: 'Tighten the hook and shorten the caption.',
          itemIds: ['item-1'],
        } as never,
        user,
      );

      expect(service.requestChanges).toHaveBeenCalledWith(
        'run-1',
        ['item-1'],
        'test-object-id',
        'Tighten the hook and shorten the caption.',
        'test-object-id',
      );
    });

    it('passes the canonical user id when rejecting items', async () => {
      service.rejectItems.mockResolvedValue({ id: 'run-1' } as never);

      await controller.itemAction(
        mockReq,
        'run-1',
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
        'run-1',
        ['item-1'],
        'test-object-id',
        'Not aligned with the brief.',
        'test-object-id',
      );
    });
  });

  describe('rewrite jobs', () => {
    const user = {
      id: 'user-1',
      organizationId: 'org-1',
      userId: 'user-1',
    } as never;

    it('queues a rewrite priced per distinct item from the admitted credits', async () => {
      rewriteService.enqueue.mockResolvedValue({ id: 'job-1' });
      const req = {
        creditsConfig: {
          amount: 4,
          description: 'Turbo rewrite (text model)',
          source: ActivitySource.POST_ENHANCEMENT,
        },
      } as never;

      await expect(
        controller.createRewriteJob(
          req,
          'run-1',
          { itemIds: ['item-1', 'item-2', 'item-1'] },
          user,
        ),
      ).resolves.toEqual({ id: 'job-1' });
      expect(rewriteService.enqueue).toHaveBeenCalledWith({
        turboRunId: 'run-1',
        credits: {
          amountPerItem: 2,
          description: 'Turbo rewrite (text model)',
          source: ActivitySource.POST_ENHANCEMENT,
        },
        itemIds: ['item-1', 'item-2', 'item-1'],
        organizationId: 'org-1',
        userId: 'user-1',
      });
    });

    it('scopes progress, the active job, and cancellation to the organization', async () => {
      rewriteService.getActiveJob.mockResolvedValue(null);

      await expect(
        controller.getActiveRewriteJob('run-1', user),
      ).resolves.toEqual({ job: null });
      await controller.getRewriteJob('run-1', 'job-1', user);
      await controller.cancelRewriteJob('run-1', 'job-1', user);

      expect(rewriteService.getActiveJob).toHaveBeenCalledWith(
        'run-1',
        'org-1',
      );
      expect(rewriteService.getJob).toHaveBeenCalledWith(
        'run-1',
        'job-1',
        'org-1',
      );
      expect(rewriteService.cancel).toHaveBeenCalledWith(
        'run-1',
        'job-1',
        'org-1',
      );
    });
  });

  describe('assignItem', () => {
    it('assigns with the canonical user id and organization', async () => {
      service.assignItem.mockResolvedValue({ id: 'run-1' } as never);

      await controller.assignItem(
        mockReq,
        'run-1',
        'item-1',
        { assigneeId: 'user-1' } as never,
        {
          organizationId: 'org-1',
          userId: 'actor-1',
        } as never,
      );

      expect(service.assignItem).toHaveBeenCalledWith(
        'run-1',
        'item-1',
        'user-1',
        'org-1',
      );
    });
  });

  describe('unassignItem', () => {
    it('clears assignment for the tenant-scoped item', async () => {
      service.unassignItem.mockResolvedValue({ id: 'run-1' } as never);

      await controller.unassignItem(mockReq, 'run-1', 'item-1', {
        organizationId: 'org-1',
        userId: 'actor-1',
      } as never);

      expect(service.unassignItem).toHaveBeenCalledWith(
        'run-1',
        'item-1',
        'org-1',
      );
    });
  });
});
