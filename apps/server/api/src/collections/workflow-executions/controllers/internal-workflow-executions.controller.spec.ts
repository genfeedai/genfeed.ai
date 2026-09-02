import { InternalWorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/internal-workflow-executions.controller';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ModuleRef } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('InternalWorkflowExecutionsController', () => {
  let controller: InternalWorkflowExecutionsController;

  const workflowId = testId('workflow');
  const organizationId = testId('org');
  const userId = testId('user');
  const executionId = testId('execution');

  const mockRequest = {} as Request;
  const mockWorkflow = {
    id: workflowId,
    organizationId,
    userId,
  };
  const mockExecution = {
    id: executionId,
    organizationId,
    status: 'running',
    userId: mockWorkflow.userId,
    workflowId: mockWorkflow.id,
  };

  const mockWorkflowExecutorService = {
    executeManualWorkflow: vi.fn(),
  };
  const mockWorkflowExecutionsService = {
    cancelExecution: vi.fn(),
    findOne: vi.fn(),
  };
  const mockWorkflowsService = {
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InternalWorkflowExecutionsController],
      providers: [
        {
          provide: ModuleRef,
          useValue: {
            get: vi.fn((token: unknown) =>
              token === WorkflowExecutorService
                ? mockWorkflowExecutorService
                : undefined,
            ),
          },
        },
        {
          provide: WorkflowExecutionsService,
          useValue: mockWorkflowExecutionsService,
        },
        {
          provide: WorkflowsService,
          useValue: mockWorkflowsService,
        },
        {
          provide: AdminApiKeyGuard,
          useValue: { canActivate: vi.fn().mockReturnValue(true) },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn() },
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

    controller = module.get<InternalWorkflowExecutionsController>(
      InternalWorkflowExecutionsController,
    );
    vi.clearAllMocks();
  });

  it('creates an execution for an org-scoped workflow', async () => {
    mockWorkflowsService.findOne.mockResolvedValue(mockWorkflow);
    mockWorkflowExecutorService.executeManualWorkflow.mockResolvedValue({
      executionId,
    });
    mockWorkflowExecutionsService.findOne.mockResolvedValue(mockExecution);

    const result = await controller.create(mockRequest, organizationId, {
      inputValues: { prompt: 'hello' },
      workflowId: mockWorkflow.id,
    });

    expect(
      mockWorkflowExecutorService.executeManualWorkflow,
    ).toHaveBeenCalledWith(
      workflowId,
      userId,
      organizationId,
      { prompt: 'hello' },
      undefined,
      undefined,
    );
    expect(result).toBeDefined();
  });

  it('loads an execution within the requested org', async () => {
    mockWorkflowExecutionsService.findOne.mockResolvedValue(mockExecution);

    const result = await controller.findOne(
      mockRequest,
      organizationId,
      executionId,
    );

    expect(mockWorkflowExecutionsService.findOne).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('cancels an execution within the requested org', async () => {
    mockWorkflowExecutionsService.findOne.mockResolvedValue(mockExecution);
    mockWorkflowExecutionsService.cancelExecution.mockResolvedValue({
      ...mockExecution,
      status: 'cancelled',
    });

    const result = await controller.update(
      mockRequest,
      organizationId,
      executionId,
      { status: WorkflowExecutionStatus.CANCELLED },
    );

    expect(mockWorkflowExecutionsService.cancelExecution).toHaveBeenCalledWith(
      executionId,
    );
    expect(result).toBeDefined();
  });

  it('throws NotFoundException when the execution does not exist in the org', async () => {
    mockWorkflowExecutionsService.findOne.mockResolvedValue(null);

    await expect(
      controller.update(mockRequest, organizationId, 'missing-id', {
        status: WorkflowExecutionStatus.CANCELLED,
      }),
    ).rejects.toThrow('Execution');
    expect(
      mockWorkflowExecutionsService.cancelExecution,
    ).not.toHaveBeenCalled();
  });
});
