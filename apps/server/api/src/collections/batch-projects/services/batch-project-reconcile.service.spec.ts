import {
  BatchProjectReconcileService,
  IDEA_DISPATCH_TIMEOUT_MS,
} from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import { batchChildExecutionKey } from '@api/collections/batch-projects/services/batch-project-workflow-output.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  IngredientCategory,
  IngredientStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { ConflictException } from '@nestjs/common';

type Row = Record<string, unknown>;

function makeItem(overrides: Row = {}): Row {
  return {
    caption: null,
    dispatchedAt: new Date(),
    error: null,
    id: 'item-1',
    idea: null,
    inputIngredientId: 'input-1',
    isDeleted: false,
    organizationId: 'org-1',
    outputIngredientId: null,
    position: 0,
    postId: null,
    projectId: 'project-1',
    reviewBatchId: null,
    retryCount: 0,
    reviewItemId: null,
    scheduledAt: null,
    scheduledTargets: [],
    status: BatchProjectItemStatus.GENERATING,
    workflowExecutionId: 'parent-1',
    workflowItemIndex: 0,
    ...overrides,
  };
}

function makeProject(items: Row[], overrides: Row = {}): Row {
  return {
    brandId: 'brand-1',
    id: 'project-1',
    items,
    kind: BatchProjectKind.WORKFLOW,
    name: 'Product shots',
    organizationId: 'org-1',
    reviewBatchId: null,
    status: BatchProjectStatus.GENERATING,
    userId: 'user-1',
    workflowId: 'workflow-1',
    ...overrides,
  };
}

describe('BatchProjectReconcileService', () => {
  const prisma = {
    batchItem: { findMany: vi.fn() },
    batchProject: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    batchProjectItem: { findMany: vi.fn(), updateMany: vi.fn() },
    ingredient: { findFirst: vi.fn(), findMany: vi.fn() },
    workflow: { findFirst: vi.fn() },
    workflowExecution: { findFirst: vi.fn(), findMany: vi.fn() },
    workflowExecutionNodeResult: { findMany: vi.fn() },
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const cacheService = {
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
    withLock: vi.fn(
      async (_key: string, operation: () => Promise<unknown>) =>
        await operation(),
    ),
  };
  const batchGenerationService = {
    appendManualReviewItems: vi.fn(),
    createManualReviewBatch: vi.fn(),
  };
  const service = new BatchProjectReconcileService(
    prisma as never,
    logger as never,
    cacheService as never,
    batchGenerationService as never,
  );

  function useProject(project: Row) {
    prisma.batchProject.findFirst.mockImplementation(
      async (args: { include?: unknown }) =>
        args.include
          ? project
          : { items: project.items, status: project.status },
    );
  }

  function updatedItem(itemId: string) {
    return prisma.batchProjectItem.updateMany.mock.calls
      .map(([args]) => args)
      .filter((args) => args.where.id === itemId)
      .map((args) => args.data);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.batchItem.findMany.mockResolvedValue([]);
    prisma.batchProject.updateMany.mockResolvedValue({ count: 1 });
    prisma.batchProjectItem.findMany.mockResolvedValue([]);
    prisma.batchProjectItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.findFirst.mockResolvedValue(null);
    prisma.ingredient.findMany.mockResolvedValue([]);
    prisma.workflow.findFirst.mockResolvedValue({ label: 'Upscale' });
    prisma.workflowExecution.findFirst.mockResolvedValue({
      error: null,
      id: 'parent-1',
      result: {
        metadata: { batchExecution: { childWorkflowVersionId: 'version-1' } },
      },
      status: WorkflowExecutionStatus.RUNNING,
    });
    prisma.workflowExecution.findMany.mockResolvedValue([]);
    prisma.workflowExecutionNodeResult.findMany.mockResolvedValue([]);
    batchGenerationService.createManualReviewBatch.mockResolvedValue({
      id: 'review-batch-1',
      items: [
        {
          id: 'review-item-1',
          postId: 'post-1',
          sourceActionId: 'batch-project-item:item-1',
        },
      ],
    });
  });

  it('sends a finished workflow output to the review inbox with its lineage', async () => {
    useProject(makeProject([makeItem()]));
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        error: null,
        id: 'child-1',
        idempotencyKey: batchChildExecutionKey({
          childWorkflowVersionId: 'version-1',
          index: 0,
          parentExecutionId: 'parent-1',
        }),
        status: WorkflowExecutionStatus.COMPLETED,
      },
    ]);
    prisma.ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.VIDEO,
      id: 'output-1',
    });

    await service.reconcileProject('project-1', 'org-1');

    expect(batchGenerationService.createManualReviewBatch).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        items: [
          expect.objectContaining({
            format: 'video',
            ingredientId: 'output-1',
            sourceActionId: 'batch-project-item:item-1',
            sourceWorkflowId: 'workflow-1',
            sourceWorkflowName: 'Upscale',
            targetIdempotencyKey: 'batch-project-item:item-1',
            workflowExecutionId: 'parent-1',
          }),
        ],
      },
      'user-1',
      'org-1',
    );
    expect(prisma.batchProject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reviewBatchId: 'review-batch-1' } }),
    );
    expect(updatedItem('item-1')).toContainEqual(
      expect.objectContaining({
        outputIngredientId: 'output-1',
        postId: 'post-1',
        reviewBatchId: 'review-batch-1',
        reviewItemId: 'review-item-1',
        status: BatchProjectItemStatus.READY,
      }),
    );
  });

  it('appends later outputs to the existing review batch', async () => {
    useProject(makeProject([makeItem()], { reviewBatchId: 'review-batch-1' }));
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        error: null,
        id: 'child-1',
        idempotencyKey: batchChildExecutionKey({
          childWorkflowVersionId: 'version-1',
          index: 0,
          parentExecutionId: 'parent-1',
        }),
        status: WorkflowExecutionStatus.COMPLETED,
      },
    ]);
    prisma.ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.IMAGE,
      id: 'output-1',
    });
    batchGenerationService.appendManualReviewItems.mockResolvedValue({
      id: 'review-batch-1',
      items: [
        {
          id: 'review-item-1',
          postId: 'post-1',
          sourceActionId: 'batch-project-item:item-1',
        },
      ],
    });

    await service.reconcileProject('project-1', 'org-1');

    expect(batchGenerationService.appendManualReviewItems).toHaveBeenCalledWith(
      'review-batch-1',
      expect.objectContaining({ brandId: 'brand-1' }),
      'user-1',
      'org-1',
    );
    expect(
      batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
  });

  it('starts a new review batch when the previous one was removed', async () => {
    useProject(
      makeProject([makeItem()], { reviewBatchId: 'review-batch-gone' }),
    );
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        error: null,
        id: 'child-1',
        idempotencyKey: batchChildExecutionKey({
          childWorkflowVersionId: 'version-1',
          index: 0,
          parentExecutionId: 'parent-1',
        }),
        status: WorkflowExecutionStatus.COMPLETED,
      },
    ]);
    prisma.ingredient.findFirst.mockResolvedValue({
      category: IngredientCategory.IMAGE,
      id: 'output-1',
    });
    batchGenerationService.appendManualReviewItems.mockRejectedValue(
      new NotFoundException('Batch', 'review-batch-gone'),
    );

    await service.reconcileProject('project-1', 'org-1');

    expect(batchGenerationService.createManualReviewBatch).toHaveBeenCalled();
  });

  it('reads the output from node results when no ingredient is linked', async () => {
    useProject(makeProject([makeItem()]));
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        error: null,
        id: 'child-1',
        idempotencyKey: batchChildExecutionKey({
          childWorkflowVersionId: 'version-1',
          index: 0,
          parentExecutionId: 'parent-1',
        }),
        status: WorkflowExecutionStatus.COMPLETED,
      },
    ]);
    prisma.workflowExecutionNodeResult.findMany.mockResolvedValue([
      { output: { image: { id: 'output-from-node' } } },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      { category: IngredientCategory.IMAGE, id: 'output-from-node' },
    ]);

    await service.reconcileProject('project-1', 'org-1');

    expect(prisma.workflowExecutionNodeResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { executionId: 'child-1', organizationId: 'org-1' },
      }),
    );
    expect(batchGenerationService.createManualReviewBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ ingredientId: 'output-from-node' })],
      }),
      'user-1',
      'org-1',
    );
  });

  it('fails only the item whose child run failed', async () => {
    useProject(
      makeProject([
        makeItem(),
        makeItem({ id: 'item-2', workflowItemIndex: 1 }),
      ]),
    );
    prisma.workflowExecution.findMany.mockResolvedValue([
      {
        error: 'Upscaler timed out',
        id: 'child-1',
        idempotencyKey: batchChildExecutionKey({
          childWorkflowVersionId: 'version-1',
          index: 0,
          parentExecutionId: 'parent-1',
        }),
        status: WorkflowExecutionStatus.FAILED,
      },
    ]);

    await service.reconcileProject('project-1', 'org-1');

    expect(updatedItem('item-1')).toContainEqual({
      error: 'Upscaler timed out',
      status: BatchProjectItemStatus.FAILED,
    });
    expect(updatedItem('item-2')).toEqual([]);
    expect(
      batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
  });

  it('fails items the finished batch never ran', async () => {
    useProject(makeProject([makeItem()]));
    prisma.workflowExecution.findFirst.mockResolvedValue({
      error: 'Credits exhausted',
      id: 'parent-1',
      result: {
        metadata: { batchExecution: { childWorkflowVersionId: 'version-1' } },
      },
      status: WorkflowExecutionStatus.FAILED,
    });

    await service.reconcileProject('project-1', 'org-1');

    expect(updatedItem('item-1')).toContainEqual({
      error: 'Credits exhausted',
      status: BatchProjectItemStatus.FAILED,
    });
  });

  it('resolves idea items from their generated ingredient', async () => {
    const stale = new Date(Date.now() - IDEA_DISPATCH_TIMEOUT_MS - 1000);
    useProject(
      makeProject(
        [
          makeItem({ id: 'ready', outputIngredientId: 'ingredient-ready' }),
          makeItem({ id: 'failed', outputIngredientId: 'ingredient-failed' }),
          makeItem({ dispatchedAt: stale, id: 'never-dispatched' }),
          makeItem({ id: 'in-flight' }),
        ].map((item) => ({
          ...item,
          idea: {
            caption: 'Fresh drop',
            format: 'image',
            hook: 'Meet the new mug',
            id: 'idea-1',
            platformHints: [],
            visualPrompt: 'A mug on a desk',
          },
          workflowExecutionId: null,
          workflowItemIndex: null,
        })),
        { kind: BatchProjectKind.IDEAS, workflowId: null },
      ),
    );
    prisma.ingredient.findMany.mockResolvedValue([
      {
        category: IngredientCategory.IMAGE,
        generationError: null,
        id: 'ingredient-ready',
        status: IngredientStatus.GENERATED,
      },
      {
        category: IngredientCategory.IMAGE,
        generationError: 'Safety filter',
        id: 'ingredient-failed',
        status: IngredientStatus.FAILED,
      },
    ]);
    batchGenerationService.createManualReviewBatch.mockResolvedValue({
      id: 'review-batch-1',
      items: [
        {
          id: 'review-item-ready',
          postId: 'post-ready',
          sourceActionId: 'batch-project-item:ready',
        },
      ],
    });

    await service.reconcileProject('project-1', 'org-1');

    expect(batchGenerationService.createManualReviewBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            caption: 'Fresh drop',
            format: 'image',
            label: 'Meet the new mug',
            prompt: 'A mug on a desk',
          }),
        ],
      }),
      'user-1',
      'org-1',
    );
    expect(updatedItem('ready')).toContainEqual(
      expect.objectContaining({ status: BatchProjectItemStatus.READY }),
    );
    expect(updatedItem('failed')).toContainEqual({
      error: 'Safety filter',
      status: BatchProjectItemStatus.FAILED,
    });
    expect(updatedItem('never-dispatched')).toContainEqual({
      error: 'Generation did not start. Retry this item.',
      status: BatchProjectItemStatus.FAILED,
    });
    expect(updatedItem('in-flight')).toEqual([]);
  });

  it('mirrors review inbox decisions onto the project items', async () => {
    useProject(makeProject([], { status: BatchProjectStatus.REVIEWING }));
    prisma.batchProjectItem.findMany.mockResolvedValue([
      makeItem({
        id: 'approved-in-inbox',
        reviewItemId: 'review-1',
        status: BatchProjectItemStatus.READY,
      }),
      makeItem({
        id: 'reopened-in-inbox',
        reviewItemId: 'review-2',
        status: BatchProjectItemStatus.REJECTED,
      }),
    ]);
    prisma.batchItem.findMany.mockResolvedValue([
      { id: 'review-1', reviewDecision: 'APPROVED' },
      { id: 'review-2', reviewDecision: null },
    ]);

    await service.reconcileProject('project-1', 'org-1');

    expect(prisma.batchItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(updatedItem('approved-in-inbox')).toContainEqual({
      status: BatchProjectItemStatus.APPROVED,
    });
    expect(updatedItem('reopened-in-inbox')).toContainEqual({
      status: BatchProjectItemStatus.READY,
    });
  });

  it('does nothing while another reconcile holds the project', async () => {
    cacheService.withLock.mockResolvedValueOnce(null);

    await service.reconcileProject('project-1', 'org-1');

    expect(prisma.batchProject.findFirst).not.toHaveBeenCalled();
  });

  it('sweeps generating projects across organizations and survives one failure', async () => {
    prisma.batchProject.findMany.mockResolvedValue([
      { id: 'project-a', organizationId: 'org-a' },
      { id: 'project-b', organizationId: 'org-b' },
    ]);
    prisma.batchProject.findFirst
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(null);

    await expect(service.reconcileGeneratingProjects()).resolves.toBe(2);

    expect(prisma.batchProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, status: BatchProjectStatus.GENERATING },
      }),
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('sweeps every generating project, page by page, not only the oldest ones', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `project-${String(index).padStart(3, '0')}`,
      organizationId: 'org-1',
    }));
    prisma.batchProject.findMany
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        { id: 'project-newest', organizationId: 'org-2' },
      ])
      .mockResolvedValueOnce([]);
    prisma.batchProject.findFirst.mockResolvedValue(null);

    await expect(service.reconcileGeneratingProjects()).resolves.toBe(51);

    expect(cacheService.withLock).toHaveBeenCalledWith(
      'batch-project-reconcile:project-newest',
      expect.any(Function),
      expect.any(Number),
    );
    expect(prisma.batchProject.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: 'project-049' },
        orderBy: { id: 'asc' },
        skip: 1,
      }),
    );
  });

  it('fails a workflow item whose run never got recorded', async () => {
    useProject(
      makeProject([
        makeItem({
          dispatchedAt: new Date(Date.now() - IDEA_DISPATCH_TIMEOUT_MS - 1000),
          workflowExecutionId: null,
          workflowItemIndex: null,
        }),
      ]),
    );

    await service.reconcileProject('project-1', 'org-1');

    expect(updatedItem('item-1')).toContainEqual({
      error: 'The workflow run did not start. Retry this item.',
      status: BatchProjectItemStatus.FAILED,
    });
  });

  describe('runExclusive', () => {
    it('runs the operation holding the reconcile lock of the project', async () => {
      cacheService.acquireLock.mockResolvedValue(true);

      await expect(
        service.runExclusive('project-1', async () => 'done'),
      ).resolves.toBe('done');

      expect(cacheService.acquireLock).toHaveBeenCalledWith(
        'batch-project-reconcile:project-1',
        expect.any(Number),
      );
      expect(cacheService.releaseLock).toHaveBeenCalledWith(
        'batch-project-reconcile:project-1',
      );
    });

    it('reports a busy project instead of running alongside a reconcile', async () => {
      cacheService.acquireLock.mockResolvedValue(false);
      const operation = vi.fn();

      await expect(
        service.runExclusive('project-1', operation),
      ).rejects.toThrow(ConflictException);
      expect(operation).not.toHaveBeenCalled();
    });
  });
});
