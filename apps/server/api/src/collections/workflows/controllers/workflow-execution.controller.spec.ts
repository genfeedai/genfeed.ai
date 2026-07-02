import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowExecutionController } from '@api/collections/workflows/controllers/workflow-execution.controller';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowSchedulerService } from '@api/collections/workflows/services/workflow-scheduler.service';
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
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockWorkflowsService = {
    archiveWorkflow: vi.fn(),
    executePartial: vi.fn(),
    findMutableOwnedOrThrow: vi.fn(),
    getExecutionLogs: vi.fn(),
    lockNodes: vi.fn(),
    publishWorkflowLifecycle: vi.fn(),
    resumeFromFailed: vi.fn(),
    setThumbnail: vi.fn(),
    unlockNodes: vi.fn(),
    validateCredits: vi.fn(),
  };

  const mockWorkflowExecutorService = {
    submitReviewGateApproval: vi.fn(),
  };

  const mockWorkflowSchedulerService = {
    updateSchedule: vi.fn(),
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
          provide: WorkflowExecutorService,
          useValue: mockWorkflowExecutorService,
        },
        {
          provide: WorkflowSchedulerService,
          useValue: mockWorkflowSchedulerService,
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

  describe('setThumbnail', () => {
    it('should persist the workflow thumbnail for the current user org', async () => {
      mockWorkflowsService.findMutableOwnedOrThrow.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
      });
      mockWorkflowsService.setThumbnail.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        thumbnail: 'https://cdn.example.com/thumb.jpg',
        thumbnailNodeId: 'node-output-1',
      });

      const result = await controller.setThumbnail(
        mockRequest,
        '507f1f77bcf86cd799439014',
        {
          nodeId: 'node-output-1',
          thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
        },
        mockUser,
      );

      expect(mockWorkflowsService.findMutableOwnedOrThrow).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        {
          organization: mockUser.publicMetadata.organization,
          user: mockUser.publicMetadata.user,
        },
      );
      expect(mockWorkflowsService.setThumbnail).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439014',
        'https://cdn.example.com/thumb.jpg',
        'node-output-1',
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
      );
      expect(result).toBeDefined();
    });
  });

  describe('submitApproval', () => {
    it('should submit a review gate approval for the current org', async () => {
      mockWorkflowExecutorService.submitReviewGateApproval.mockResolvedValue({
        approvedAt: '2026-01-01T00:00:00.000Z',
        approvedBy: mockUser.publicMetadata.user,
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
        mockUser.publicMetadata.user,
        mockUser.publicMetadata.organization,
        'review-gate-1',
        true,
        undefined,
      );
      expect(result).toEqual({
        data: {
          approvedAt: '2026-01-01T00:00:00.000Z',
          approvedBy: mockUser.publicMetadata.user,
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
