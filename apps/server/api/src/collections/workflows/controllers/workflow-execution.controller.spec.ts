import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowRunControlService } from '@api/collections/workflows/services/workflow-run-control.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('WorkflowExecutionController', () => {
  let controller: WorkflowExecutionController;

  const mockRequest = {} as Request;

  const mockUser: User = {
    organizationId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439011',
  } as unknown as User;

  const mockWorkflowsService = {
    findMutableOwnedOrThrow: vi.fn(),
    findOwnedOrThrow: vi.fn(),
    lockNodes: vi.fn(),
    unlockNodes: vi.fn(),
  };

  const mockWorkflowRunControlService = {
    executePartial: vi.fn(),
    getExecutionLogs: vi.fn(),
    resumeFromFailed: vi.fn(),
    validateCredits: vi.fn(),
  };

  const mockWorkflowExecutorService = {
    submitReviewGateApproval: vi.fn(),
  };

  const mockWorkflowExecutionAuthorizationService = {
    authorize: vi.fn().mockResolvedValue(undefined),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowExecutionController],
      providers: [
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        {
          provide: WorkflowRunControlService,
          useValue: mockWorkflowRunControlService,
        },
        {
          provide: WorkflowExecutionAuthorizationService,
          useValue: mockWorkflowExecutionAuthorizationService,
        },
        {
          provide: WorkflowExecutorService,
          useValue: mockWorkflowExecutorService,
        },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkflowExecutionController>(
      WorkflowExecutionController,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('patchNodes', () => {
    beforeEach(() => {
      mockWorkflowsService.findMutableOwnedOrThrow.mockResolvedValue({
        id: '507f1f77bcf86cd799439014',
      });
      mockWorkflowsService.findOwnedOrThrow.mockResolvedValue({
        id: '507f1f77bcf86cd799439014',
      });
    });

    it('should lock nodes and not unlock when only lock is provided', async () => {
      const result = await controller.patchNodes(
        mockRequest,
        '507f1f77bcf86cd799439014',
        { lock: ['node-1'] },
        mockUser,
      );

      expect(mockWorkflowsService.findMutableOwnedOrThrow).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        {
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        },
      );
      expect(mockWorkflowsService.lockNodes).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        ['node-1'],
        mockUser.organizationId,
      );
      expect(mockWorkflowsService.unlockNodes).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should unlock nodes and not lock when only unlock is provided', async () => {
      const result = await controller.patchNodes(
        mockRequest,
        '507f1f77bcf86cd799439014',
        { unlock: ['node-1'] },
        mockUser,
      );

      expect(mockWorkflowsService.unlockNodes).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        ['node-1'],
        mockUser.organizationId,
      );
      expect(mockWorkflowsService.lockNodes).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should fall back to findOwnedOrThrow when neither lock nor unlock is provided', async () => {
      const result = await controller.patchNodes(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {},
        mockUser,
      );

      expect(mockWorkflowsService.findOwnedOrThrow).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        {
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        },
      );
      expect(mockWorkflowsService.lockNodes).not.toHaveBeenCalled();
      expect(mockWorkflowsService.unlockNodes).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('resumeExecution', () => {
    it('authorizes the connected thread before resuming a failed run', async () => {
      mockWorkflowRunControlService.resumeFromFailed.mockResolvedValue({
        message: 'Partial execution started',
        runId: 'exec-2',
        status: 'PENDING',
      });

      const result = await controller.resumeExecution(
        '507f1f77bcf86cd799439014',
        'exec-1',
        { expectedContextVersion: 4, threadId: 'thread-1' },
        mockUser,
      );

      expect(
        mockWorkflowExecutionAuthorizationService.authorize,
      ).toHaveBeenCalledWith({
        expectedContextVersion: 4,
        organizationId: mockUser.organizationId,
        requestedBrandId: undefined,
        threadId: 'thread-1',
        userId: mockUser.userId,
        workflowId: '507f1f77bcf86cd799439014',
      });
      expect(
        mockWorkflowRunControlService.resumeFromFailed,
      ).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        'exec-1',
        mockUser.userId,
        mockUser.organizationId,
      );
      expect(result.data.runId).toBe('exec-2');
    });
  });

  describe('submitApproval', () => {
    it('should submit a review gate approval for the current org', async () => {
      mockWorkflowExecutorService.submitReviewGateApproval.mockResolvedValue({
        approvedAt: '2026-01-01T00:00:00.000Z',
        approvedBy: mockUser.userId,
        executionId: 'exec-1',
        nodeId: 'review-gate-1',
        status: 'approved',
      });

      const result = await controller.submitApproval(
        '507f1f77bcf86cd799439014',
        'exec-1',
        { approved: true, nodeId: 'review-gate-1' },
        mockUser,
      );

      expect(
        mockWorkflowExecutorService.submitReviewGateApproval,
      ).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        'exec-1',
        mockUser.userId,
        mockUser.organizationId,
        'review-gate-1',
        true,
        undefined,
      );
      expect(
        mockWorkflowExecutionAuthorizationService.authorize,
      ).toHaveBeenCalledWith({
        expectedContextVersion: undefined,
        organizationId: mockUser.organizationId,
        requestedBrandId: undefined,
        threadId: undefined,
        userId: mockUser.userId,
        workflowId: '507f1f77bcf86cd799439014',
      });
      expect(result).toEqual({
        data: {
          approvedAt: '2026-01-01T00:00:00.000Z',
          approvedBy: mockUser.userId,
          executionId: 'exec-1',
          nodeId: 'review-gate-1',
          status: 'approved',
        },
      });
    });

    it('should preserve a service-thrown HttpException status instead of downgrading to 500', async () => {
      mockWorkflowExecutorService.submitReviewGateApproval.mockRejectedValue(
        new BadRequestException('Review gate already resolved'),
      );

      await expect(
        controller.submitApproval(
          '507f1f77bcf86cd799439014',
          'exec-1',
          { approved: true, nodeId: 'review-gate-1' },
          mockUser,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
