import { BatchWorkflowExecutionService } from '@api/collections/workflows/services/batch-workflow-execution.service';
import type { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { BadRequestException } from '@nestjs/common';

type Ingredient = { id: string; isDeleted: boolean; organizationId: string };
type QueuedExecution = {
  execution: Record<string, unknown>;
  options: Record<string, unknown>;
};

/**
 * In-memory ingredients and tenant workflows, plus a system runner that
 * keeps its registered graphs and queued executions.
 */
function setup() {
  const ingredients: Ingredient[] = [
    { id: 'ingredient-1', isDeleted: false, organizationId: 'org-1' },
    { id: 'ingredient-2', isDeleted: false, organizationId: 'org-1' },
    { id: 'video-ingredient-1', isDeleted: false, organizationId: 'org-1' },
    { id: 'ingredient-deleted', isDeleted: true, organizationId: 'org-1' },
    {
      id: 'ingredient-other-tenant',
      isDeleted: false,
      organizationId: 'org-2',
    },
  ];
  const registered: { canonicalId: string }[] = [];
  const queued: QueuedExecution[] = [];
  const prisma = {
    ingredient: {
      count: async ({
        where,
      }: {
        where: {
          id: { in: string[] };
          isDeleted: boolean;
          organizationId: string;
        };
      }) =>
        ingredients.filter(
          (ingredient) =>
            where.id.in.includes(ingredient.id) &&
            ingredient.isDeleted === where.isDeleted &&
            ingredient.organizationId === where.organizationId,
        ).length,
    },
  };
  const workflows = {
    findOwnedOrThrow: async (id: string, scope: { organizationId: string }) => {
      if (id !== 'workflow-1' || scope.organizationId !== 'org-1') {
        throw new NotFoundException('Workflow');
      }
      return { id: 'workflow-1', versionId: 'version-1' };
    },
  };
  const runner = {
    enqueueWorkflow: async (
      execution: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => {
      queued.push({ execution, options });
      return {
        executionId: `parent-execution-${queued.length}`,
        status: 'PENDING',
      };
    },
    registerWorkflow: (graph: { canonicalId: string }) => {
      registered.push(graph);
    },
  };
  const service = new BatchWorkflowExecutionService(
    prisma as unknown as PrismaService,
    workflows as unknown as WorkflowsService,
    runner as unknown as SystemWorkflowRunnerService,
  );
  return { queued, registered, service };
}

const batch = (ingredientIds: string[], workflowId = 'workflow-1') => ({
  ingredientIds,
  organizationId: 'org-1',
  userId: 'user-1',
  workflowId,
});

describe('BatchWorkflowExecutionService', () => {
  it('registers one fixed hidden parent graph', () => {
    const { registered, service } = setup();

    service.onModuleInit();

    expect(registered).toEqual([
      expect.objectContaining({ canonicalId: 'workflow.batch.execute' }),
    ]);
  });

  it('pins the selected tenant workflow version in the parent execution', async () => {
    const { queued, service } = setup();

    await expect(
      service.startBatchExecution(batch(['ingredient-1', 'ingredient-2'])),
    ).resolves.toBe('parent-execution-1');

    expect(queued).toEqual([
      {
        execution: expect.objectContaining({
          canonicalId: 'workflow.batch.execute',
          inputValues: {
            childWorkflowId: 'workflow-1',
            childWorkflowVersionId: 'version-1',
            items: ['ingredient-1', 'ingredient-2'],
          },
          organizationId: 'org-1',
          userId: 'user-1',
        }),
        options: expect.objectContaining({
          dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
        }),
      },
    ]);
  });

  it('does not run another organization’s workflow', async () => {
    const { queued, service } = setup();

    await expect(
      service.startBatchExecution(batch(['ingredient-1'], 'workflow-foreign')),
    ).rejects.toThrow('Workflow not found');
    expect(queued).toEqual([]);
  });

  it.each([
    ['outside the tenant', 'ingredient-other-tenant'],
    ['soft-deleted', 'ingredient-deleted'],
  ])('fails before execution when an ingredient is %s', async (_label, id) => {
    const { queued, service } = setup();

    await expect(
      service.startBatchExecution(batch(['ingredient-1', id])),
    ).rejects.toThrow(BadRequestException);
    expect(queued).toEqual([]);
  });

  it('rejects duplicate ingredients instead of executing the same effect twice', async () => {
    const { queued, service } = setup();

    await expect(
      service.startBatchExecution(batch(['ingredient-1', 'ingredient-1'])),
    ).rejects.toThrow('Duplicate ingredientIds are not allowed');
    expect(queued).toEqual([]);
  });

  it('runs a single video input, the shape a per-item retry sends', async () => {
    const { queued, service } = setup();

    await expect(
      service.startBatchExecution(batch(['video-ingredient-1'])),
    ).resolves.toBe('parent-execution-1');

    expect(queued).toEqual([
      expect.objectContaining({
        execution: expect.objectContaining({
          inputValues: expect.objectContaining({
            items: ['video-ingredient-1'],
          }),
          metadata: {
            batchExecution: expect.objectContaining({ itemCount: 1 }),
          },
        }),
      }),
    ]);
  });

  it('refuses a batch with no inputs', async () => {
    const { service } = setup();

    await expect(service.startBatchExecution(batch([]))).rejects.toThrow(
      'At least one ingredientId is required',
    );
  });
});
