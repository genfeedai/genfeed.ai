import { InternalWorkflowExecutionsController } from '@api/collections/workflow-executions/controllers/internal-workflow-executions.controller';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowExecutorService } from '@api/collections/workflows/services/workflow-executor.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { WorkflowExecutionStatus } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('InternalWorkflowExecutionsController', () => {
  let controller: InternalWorkflowExecutionsController;

  const mockRequest = {} as Request;
  const mockWorkflow = {
    id: '507f1f77bcf86cd799439014',
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  };
  const mockExecution = {
    id: '507f1f77bcf86cd799439015',
    organization: '507f1f77bcf86cd799439012',
    status: 'running',
    user: mockWorkflow.user,
    workflow: mockWorkflow.id,
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
          provide: WorkflowExecutorService,
          useValue: mockWorkflowExecutorService,
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
      executionId: '507f1f77bcf86cd799439015',
    });
    mockWorkflowExecutionsService.findOne.mockResolvedValue(mockExecution);

    const result = await controller.create(
      mockRequest,
      '507f1f77bcf86cd799439012',
      {
        inputValues: { prompt: 'hello' },
        workflow: mockWorkflow.id,
      },
    );

    expect(
      mockWorkflowExecutorService.executeManualWorkflow,
    ).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439014',
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
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
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439015',
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
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439015',
      { status: WorkflowExecutionStatus.CANCELLED },
    );

    expect(mockWorkflowExecutionsService.cancelExecution).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439015',
    );
    expect(result).toBeDefined();
  });

  it('throws NotFoundException when the execution does not exist in the org', async () => {
    mockWorkflowExecutionsService.findOne.mockResolvedValue(null);

    await expect(
      controller.update(mockRequest, '507f1f77bcf86cd799439012', 'missing-id', {
        status: WorkflowExecutionStatus.CANCELLED,
      }),
    ).rejects.toThrow('Execution');
    expect(
      mockWorkflowExecutionsService.cancelExecution,
    ).not.toHaveBeenCalled();
  });
});
