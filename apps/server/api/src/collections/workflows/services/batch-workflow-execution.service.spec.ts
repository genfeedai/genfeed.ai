import { BatchWorkflowExecutionService } from '@api/collections/workflows/services/batch-workflow-execution.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('BatchWorkflowExecutionService', () => {
  const prisma = {
    ingredient: { count: vi.fn().mockResolvedValue(2) },
  };
  const workflows = {
    findOwnedOrThrow: vi.fn().mockResolvedValue({
      id: 'workflow-1',
      versionId: 'version-1',
    }),
  };
  const runner = {
    enqueueWorkflow: vi.fn().mockResolvedValue({
      executionId: 'parent-execution',
      status: 'PENDING',
    }),
    registerWorkflow: vi.fn(),
  };
  let service: BatchWorkflowExecutionService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.ingredient.count.mockResolvedValue(2);
    service = new BatchWorkflowExecutionService(
      prisma as unknown as PrismaService,
      workflows as unknown as WorkflowsService,
      runner as unknown as SystemWorkflowRunnerService,
    );
  });

  it('registers one fixed hidden parent graph', () => {
    service.onModuleInit();

    expect(runner.registerWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ canonicalId: 'workflow.batch.execute' }),
    );
  });

  it('pins the selected tenant workflow version in the parent execution', async () => {
    await expect(
      service.startBatchExecution({
        ingredientIds: ['ingredient-1', 'ingredient-2'],
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).resolves.toBe('parent-execution');

    expect(workflows.findOwnedOrThrow).toHaveBeenCalledWith('workflow-1', {
      organizationId: 'org-1',
    });
    expect(runner.enqueueWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: 'workflow.batch.execute',
        inputValues: {
          childWorkflowId: 'workflow-1',
          childWorkflowVersionId: 'version-1',
          items: ['ingredient-1', 'ingredient-2'],
        },
        organizationId: 'org-1',
        userId: 'user-1',
      }),
    );
  });

  it('fails before execution when an ingredient is outside the tenant', async () => {
    prisma.ingredient.count.mockResolvedValueOnce(1);

    await expect(
      service.startBatchExecution({
        ingredientIds: ['ingredient-1', 'ingredient-other-tenant'],
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(runner.enqueueWorkflow).not.toHaveBeenCalled();
  });

  it('rejects duplicate ingredients instead of executing the same effect twice', async () => {
    await expect(
      service.startBatchExecution({
        ingredientIds: ['ingredient-1', 'ingredient-1'],
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      }),
    ).rejects.toThrow('Duplicate ingredientIds are not allowed');
  });
});
