import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';
import { WorkflowExecutionAuthorizationService } from '@api/collections/workflows/services/workflow-execution-authorization.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowRunControlService } from '@api/collections/workflows/services/workflow-run-control.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { testId } from '@helpers/testing/test-id.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('WorkflowExecutionController', () => {
  let controller: WorkflowExecutionController;

  const mockRequest = {} as Request;

  const workflowId = testId('workflow');

  const mockUser: User = {
    organizationId: testId('org'),
    userId: testId('user'),
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
    executeManualWorkflow: vi.fn(),
    submitReviewGateApproval: vi.fn(),
  };

  const mockWorkflowExecutionsService = {
    findOne: vi.fn(),
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
        {
          provide: WorkflowExecutionsService,
          useValue: mockWorkflowExecutionsService,
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
        id: workflowId,
      });
      mockWorkflowsService.findOwnedOrThrow.mockResolvedValue({
        id: workflowId,
      });
    });

    it('should lock nodes and not unlock when only lock is provided', async () => {
      const result = await controller.patchNodes(
        mockRequest,
        workflowId,
        { lock: ['node-1'] },
        mockUser,
      );

      expect(mockWorkflowsService.findMutableOwnedOrThrow).toHaveBeenCalledWith(
        workflowId,
        {
          organizationId: mockUser.organizationId,
          userId: mockUser.userId,
        },
      );
      expect(mockWorkflowsService.lockNodes).toHaveBeenCalledWith(
        workflowId,
        ['node-1'],
        mockUser.organizationId,
      );
      expect(mockWorkflowsService.unlockNodes).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should unlock nodes and not lock when only unlock is provided', async () => {
      const result = await controller.patchNodes(
        mockRequest,
        workflowId,
        { unlock: ['node-1'] },
        mockUser,
      );

      expect(mockWorkflowsService.unlockNodes).toHaveBeenCalledWith(
        workflowId,
        ['node-1'],
        mockUser.organizationId,
      );
      expect(mockWorkflowsService.lockNodes).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should fall back to findOwnedOrThrow when neither lock nor unlock is provided', async () => {
      const result = await controller.patchNodes(
        mockRequest,
        workflowId,
        {},
        mockUser,
      );

      expect(mockWorkflowsService.findOwnedOrThrow).toHaveBeenCalledWith(
        workflowId,
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

  describe('execute', () => {
    it('runs a full 1-node prompt through executeManualWorkflow', async () => {
      mockWorkflowExecutorService.executeManualWorkflow.mockResolvedValue({
        executionId: 'exec-prompt',
        nodeResults: [{ nodeId: 'PyHRz6uB' }],
        status: 'completed',
      });
      mockWorkflowExecutionsService.findOne.mockResolvedValue({
        id: 'exec-prompt',
        nodeResults: [{ nodeId: 'PyHRz6uB' }],
      });

      const result = await controller.execute(
        mockRequest,
        workflowId,
        { debugMode: false },
        mockUser,
      );

      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).toHaveBeenCalledWith(
        workflowId,
        mockUser.userId,
        mockUser.organizationId,
        {},
        { debugMode: false },
        undefined,
        undefined,
      );
      expect(
        mockWorkflowRunControlService.executePartial,
      ).not.toHaveBeenCalled();
      expect(mockWorkflowExecutionsService.findOne).toHaveBeenCalledWith({
        id: 'exec-prompt',
        organizationId: mockUser.organizationId,
      });
      expect(result).toBeDefined();
    });

    it('maps selectedNodeIds onto the existing partial-execute path', async () => {
      mockWorkflowRunControlService.executePartial.mockResolvedValue({
        id: 'exec-partial',
      });

      await controller.execute(
        mockRequest,
        workflowId,
        { debugMode: true, selectedNodeIds: ['PyHRz6uB'] },
        mockUser,
      );

      expect(mockWorkflowRunControlService.executePartial).toHaveBeenCalledWith(
        workflowId,
        ['PyHRz6uB'],
        mockUser.userId,
        mockUser.organizationId,
      );
      expect(
        mockWorkflowExecutorService.executeManualWorkflow,
      ).not.toHaveBeenCalled();
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
        workflowId,
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
        workflowId: workflowId,
      });
      expect(
        mockWorkflowRunControlService.resumeFromFailed,
      ).toHaveBeenCalledWith(
        workflowId,
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
        workflowId,
        'exec-1',
        { approved: true, nodeId: 'review-gate-1' },
        mockUser,
      );

      expect(
        mockWorkflowExecutorService.submitReviewGateApproval,
      ).toHaveBeenCalledWith(
        workflowId,
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
        workflowId: workflowId,
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
          workflowId,
          'exec-1',
          { approved: true, nodeId: 'review-gate-1' },
          mockUser,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
