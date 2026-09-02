import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { WorkflowBatchController } from '@api/collections/workflows/controllers/workflow-batch.controller';
import { BatchWorkflowExecutionService } from '@api/collections/workflows/services/batch-workflow-execution.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('WorkflowBatchController', () => {
  const organizationId = 'org-1';
  const userId = 'user-1';
  const workflowId = 'workflow-1';
  const executionId = 'execution-1';
  const user = { organizationId, userId } as unknown as User;
  const request = { protocol: 'https' } as Request;
  const batchExecutionService = {
    startBatchExecution: vi.fn().mockResolvedValue(executionId),
  };
  const workflowExecutionsService = {
    findOne: vi.fn().mockResolvedValue({
      id: executionId,
      nodeResults: [],
      organizationId,
      status: 'PENDING',
      workflowId,
    }),
  };
  let controller: WorkflowBatchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkflowBatchController],
      providers: [
        {
          provide: BatchWorkflowExecutionService,
          useValue: batchExecutionService,
        },
        {
          provide: WorkflowExecutionsService,
          useValue: workflowExecutionsService,
        },
        {
          provide: LoggerService,
          useValue: { debug: vi.fn(), error: vi.fn(), log: vi.fn() },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(WorkflowBatchController);
  });

  afterEach(() => vi.clearAllMocks());

  it('returns the queued parent execution without waiting for child work', async () => {
    await controller.startBatchExecution(
      request,
      workflowId,
      { ingredientIds: ['ingredient-1', 'ingredient-2'] },
      user,
    );

    expect(batchExecutionService.startBatchExecution).toHaveBeenCalledWith({
      ingredientIds: ['ingredient-1', 'ingredient-2'],
      organizationId,
      userId,
      workflowId,
    });
    expect(workflowExecutionsService.findOne).toHaveBeenCalledWith({
      id: executionId,
      organizationId,
    });
  });
});
