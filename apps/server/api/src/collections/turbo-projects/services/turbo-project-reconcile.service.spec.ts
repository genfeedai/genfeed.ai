import {
  TurboProjectReconcileService,
  IDEA_REQUEUE_AFTER_MS,
  UNRECORDED_RUN_TIMEOUT_MS,
} from '@api/collections/turbo-projects/services/turbo-project-reconcile.service';
import { batchChildExecutionKey } from '@api/collections/turbo-projects/services/turbo-project-workflow-output.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
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
    reviewTurboRunId: null,
    retryCount: 0,
    reviewItemId: null,
    scheduledAt: null,
    scheduledTargets: [],
    status: TurboProjectItemStatus.GENERATING,
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
    kind: TurboProjectKind.WORKFLOW,
    name: 'Product shots',
    organizationId: 'org-1',
    reviewTurboRunId: null,
    status: TurboProjectStatus.GENERATING,
    userId: 'user-1',
    workflowId: 'workflow-1',
    ...overrides,
  };
}

describe('TurboProjectReconcileService', () => {
  const prisma = {
    turboRunItem: { findFirst: vi.fn(), findMany: vi.fn() },
    turboProject: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    turboProjectItem: { findMany: vi.fn(), updateMany: vi.fn() },
    ingredient: { findFirst: vi.fn(), findMany: vi.fn() },
    post: { findMany: vi.fn() },
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
  const ideaCredits = {
    release: vi.fn(),
    settle: vi.fn(),
  };
  const ideaDispatcher = { enqueue: vi.fn() };
  const turboRunService = {
    appendManualReviewItems: vi.fn(),
    createManualReviewTurboRun: vi.fn(),
  };
  const service = new TurboProjectReconcileService(
    prisma as never,
    logger as never,
    cacheService as never,
    turboRunService as never,
    ideaCredits as never,
    ideaDispatcher as never,
  );

  function useProject(project: Row) {
    prisma.turboProject.findFirst.mockImplementation(
      async (args: { include?: unknown }) =>
        args.include
          ? project
          : { items: project.items, status: project.status },
    );
  }

  function updatedItem(itemId: string) {
    return prisma.turboProjectItem.updateMany.mock.calls
      .map(([args]) => args)
      .filter((args) => args.where.id === itemId)
      .map((args) => args.data);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.turboRunItem.findFirst.mockResolvedValue(null);
    prisma.turboRunItem.findMany.mockResolvedValue([]);
    prisma.turboProject.updateMany.mockResolvedValue({ count: 1 });
    prisma.turboProjectItem.findMany.mockResolvedValue([]);
    prisma.turboProjectItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.ingredient.findFirst.mockResolvedValue(null);
    prisma.ingredient.findMany.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([]);
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
    turboRunService.createManualReviewTurboRun.mockResolvedValue({
      id: 'review-run-1',
      items: [
        {
          id: 'review-item-1',
          postId: 'post-1',
          sourceActionId: 'turbo-project-item:item-1',
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

    expect(turboRunService.createManualReviewTurboRun).toHaveBeenCalledWith(
      {
        brandId: 'brand-1',
        items: [
          expect.objectContaining({
            format: 'video',
            ingredientId: 'output-1',
            sourceActionId: 'turbo-project-item:item-1',
            sourceWorkflowId: 'workflow-1',
            sourceWorkflowName: 'Upscale',
            targetIdempotencyKey: 'turbo-project-item:item-1',
            workflowExecutionId: 'parent-1',
          }),
        ],
      },
      'user-1',
      'org-1',
    );
    expect(prisma.turboProject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { reviewTurboRunId: 'review-run-1' } }),
    );
    expect(updatedItem('item-1')).toContainEqual(
      expect.objectContaining({
        outputIngredientId: 'output-1',
        postId: 'post-1',
        reviewTurboRunId: 'review-run-1',
        reviewItemId: 'review-item-1',
        status: TurboProjectItemStatus.READY,
      }),
    );
  });

  it('appends later outputs to the existing review run', async () => {
    useProject(makeProject([makeItem()], { reviewTurboRunId: 'review-run-1' }));
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
    turboRunService.appendManualReviewItems.mockResolvedValue({
      id: 'review-run-1',
      items: [
        {
          id: 'review-item-1',
          postId: 'post-1',
          sourceActionId: 'turbo-project-item:item-1',
        },
      ],
    });

    await service.reconcileProject('project-1', 'org-1');

    expect(turboRunService.appendManualReviewItems).toHaveBeenCalledWith(
      'review-run-1',
      expect.objectContaining({ brandId: 'brand-1' }),
      'user-1',
      'org-1',
    );
    expect(
      turboRunService.createManualReviewTurboRun,
    ).not.toHaveBeenCalled();
  });

  it('adopts the review run a crash left unrecorded instead of creating another', async () => {
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
      category: IngredientCategory.IMAGE,
      id: 'output-1',
    });
    prisma.turboRunItem.findFirst.mockResolvedValue({
      turboRunId: 'review-run-orphan',
    });
    turboRunService.appendManualReviewItems.mockResolvedValue({
      id: 'review-run-orphan',
      items: [
        {
          id: 'review-item-1',
          postId: 'post-1',
          sourceActionId: 'turbo-project-item:item-1',
        },
      ],
    });

    await service.reconcileProject('project-1', 'org-1');

    expect(prisma.turboRunItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          OR: [
            {
              data: {
                equals: 'turbo-project-item:item-1',
                path: ['sourceActionId'],
              },
            },
          ],
          organizationId: 'org-1',
        }),
      }),
    );
    expect(turboRunService.appendManualReviewItems).toHaveBeenCalledWith(
      'review-run-orphan',
      expect.objectContaining({ brandId: 'brand-1' }),
      'user-1',
      'org-1',
    );
    expect(
      turboRunService.createManualReviewTurboRun,
    ).not.toHaveBeenCalled();
    expect(prisma.turboProject.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { reviewTurboRunId: 'review-run-orphan' },
      }),
    );
    expect(updatedItem('item-1')).toContainEqual(
      expect.objectContaining({
        reviewTurboRunId: 'review-run-orphan',
        reviewItemId: 'review-item-1',
        status: TurboProjectItemStatus.READY,
      }),
    );
  });

  it('starts a new review run when the previous one was removed', async () => {
    useProject(
      makeProject([makeItem()], { reviewTurboRunId: 'review-run-gone' }),
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
    turboRunService.appendManualReviewItems.mockRejectedValue(
      new NotFoundException('TurboRun', 'review-run-gone'),
    );

    await service.reconcileProject('project-1', 'org-1');

    expect(turboRunService.createManualReviewTurboRun).toHaveBeenCalled();
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
    expect(turboRunService.createManualReviewTurboRun).toHaveBeenCalledWith(
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
      status: TurboProjectItemStatus.FAILED,
    });
    expect(updatedItem('item-2')).toEqual([]);
    expect(
      turboRunService.createManualReviewTurboRun,
    ).not.toHaveBeenCalled();
  });

  it('fails items the finished project never ran', async () => {
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
      status: TurboProjectItemStatus.FAILED,
    });
  });

  it('resolves idea items from their generated ingredient', async () => {
    const stale = new Date(Date.now() - UNRECORDED_RUN_TIMEOUT_MS - 1000);
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
        { kind: TurboProjectKind.IDEAS, workflowId: null },
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
    turboRunService.createManualReviewTurboRun.mockResolvedValue({
      id: 'review-run-1',
      items: [
        {
          id: 'review-item-ready',
          postId: 'post-ready',
          sourceActionId: 'turbo-project-item:ready',
        },
      ],
    });

    await service.reconcileProject('project-1', 'org-1');

    expect(turboRunService.createManualReviewTurboRun).toHaveBeenCalledWith(
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
      expect.objectContaining({ status: TurboProjectItemStatus.READY }),
    );
    expect(updatedItem('failed')).toContainEqual({
      error: 'Safety filter',
      status: TurboProjectItemStatus.FAILED,
    });
    // Generated server-side: an idea without an ingredient is still queued,
    // however long ago it was claimed.
    expect(updatedItem('never-dispatched')).toEqual([]);
    expect(updatedItem('in-flight')).toEqual([]);
  });

  describe('idea credits', () => {
    const reserved = {
      attempt: 1,
      billingMode: 'platform',
      credits: 4,
      key: 'turbo-project-item:item-1:dispatch:1',
      model: 'model-image',
      reservationId: 'reservation-1',
      state: 'reserved',
    };
    const idea = {
      caption: 'Fresh drop',
      format: 'image',
      hook: 'Meet the new mug',
      id: 'idea-1',
      platformHints: [],
      visualPrompt: 'A mug on a desk',
    };

    function useIdeaItem(ingredientStatus: string) {
      useProject(
        makeProject(
          [
            makeItem({
              dispatch: reserved,
              idea,
              outputIngredientId: 'ingredient-1',
              workflowExecutionId: null,
              workflowItemIndex: null,
            }),
          ],
          { kind: TurboProjectKind.IDEAS, workflowId: null },
        ),
      );
      prisma.ingredient.findMany.mockResolvedValue([
        {
          category: IngredientCategory.IMAGE,
          generationError: 'Provider error',
          id: 'ingredient-1',
          status: ingredientStatus,
        },
      ]);
    }

    it('queues again a claimed idea whose job never started', async () => {
      const queued = { ...reserved, reservationId: undefined, state: 'queued' };
      const stale = new Date(Date.now() - IDEA_REQUEUE_AFTER_MS - 1000);
      useProject(
        makeProject(
          [
            makeItem({ dispatch: queued, dispatchedAt: stale, idea }),
            makeItem({
              dispatch: {
                ...queued,
                key: 'turbo-project-item:item-2:dispatch:1',
              },
              dispatchedAt: new Date(),
              id: 'item-2',
              idea,
            }),
            makeItem({
              dispatch: {
                ...reserved,
                key: 'turbo-project-item:item-3:dispatch:1',
              },
              dispatchedAt: stale,
              id: 'item-3',
              idea,
            }),
          ],
          { kind: TurboProjectKind.IDEAS, workflowId: null },
        ),
      );

      await service.reconcileProject('project-1', 'org-1');

      expect(ideaDispatcher.enqueue).toHaveBeenCalledTimes(1);
      expect(ideaDispatcher.enqueue).toHaveBeenCalledWith({
        itemId: 'item-1',
        key: 'turbo-project-item:item-1:dispatch:1',
        organizationId: 'org-1',
        projectId: 'project-1',
        userId: 'user-1',
      });
      expect(updatedItem('item-1')).not.toContainEqual(
        expect.objectContaining({ status: TurboProjectItemStatus.FAILED }),
      );
    });

    it('settles the reserved line once a usable output lands, before review', async () => {
      useIdeaItem(IngredientStatus.GENERATED);
      ideaCredits.settle.mockResolvedValue('settled');

      await service.reconcileProject('project-1', 'org-1');

      expect(ideaCredits.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'user-1',
          dispatch: expect.objectContaining({ reservationId: 'reservation-1' }),
          organizationId: 'org-1',
        }),
      );
      expect(ideaCredits.settle.mock.invocationCallOrder[0]).toBeLessThan(
        turboRunService.createManualReviewTurboRun.mock
          .invocationCallOrder[0],
      );
      expect(updatedItem('item-1')).toContainEqual({
        dispatch: expect.objectContaining({ state: 'settled' }),
      });
      expect(ideaCredits.release).not.toHaveBeenCalled();
    });

    it('releases the reserved line when generation fails', async () => {
      useIdeaItem(IngredientStatus.FAILED);

      await service.reconcileProject('project-1', 'org-1');

      expect(ideaCredits.release).toHaveBeenCalledWith({
        dispatch: expect.objectContaining({ reservationId: 'reservation-1' }),
        organizationId: 'org-1',
      });
      expect(ideaCredits.settle).not.toHaveBeenCalled();
      expect(updatedItem('item-1')).toContainEqual({
        dispatch: expect.objectContaining({ state: 'released' }),
      });
      expect(updatedItem('item-1')).toContainEqual({
        error: 'Provider error',
        status: TurboProjectItemStatus.FAILED,
      });
    });

    it('keeps an output out of review until its credits settle', async () => {
      useIdeaItem(IngredientStatus.GENERATED);
      ideaCredits.settle.mockRejectedValue(new Error('Billing unavailable'));

      await service.reconcileProject('project-1', 'org-1');

      expect(
        turboRunService.createManualReviewTurboRun,
      ).not.toHaveBeenCalled();
      expect(updatedItem('item-1')).toEqual([]);
    });
  });

  it('mirrors review inbox decisions onto the project items', async () => {
    useProject(makeProject([], { status: TurboProjectStatus.REVIEWING }));
    prisma.turboProjectItem.findMany.mockResolvedValue([
      makeItem({
        id: 'approved-in-inbox',
        reviewItemId: 'review-1',
        status: TurboProjectItemStatus.READY,
      }),
      makeItem({
        id: 'reopened-in-inbox',
        reviewItemId: 'review-2',
        status: TurboProjectItemStatus.REJECTED,
      }),
    ]);
    prisma.turboRunItem.findMany.mockResolvedValue([
      { id: 'review-1', reviewDecision: 'APPROVED' },
      { id: 'review-2', reviewDecision: null },
    ]);

    await service.reconcileProject('project-1', 'org-1');

    expect(prisma.turboRunItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(updatedItem('approved-in-inbox')).toContainEqual({
      status: TurboProjectItemStatus.APPROVED,
    });
    expect(updatedItem('reopened-in-inbox')).toContainEqual({
      status: TurboProjectItemStatus.READY,
    });
  });

  it('prefers the output id a node returns over earlier linked clips', async () => {
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
      id: 'earlier-clip',
    });
    prisma.workflowExecutionNodeResult.findMany.mockResolvedValue([
      {
        output: { outputIngredientId: 'stitched-video', videoUrl: 'https://x' },
      },
    ]);
    prisma.ingredient.findMany.mockResolvedValue([
      { category: IngredientCategory.VIDEO, id: 'stitched-video' },
    ]);

    await service.reconcileProject('project-1', 'org-1');

    expect(turboRunService.createManualReviewTurboRun).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ ingredientId: 'stitched-video' })],
      }),
      'user-1',
      'org-1',
    );
  });

  it.each(['REJECTED', 'CHANGES_REQUESTED'])(
    'withdraws scheduling markers after a later %s decision',
    async (decision) => {
      prisma.turboProjectItem.findMany.mockResolvedValue([
        makeItem({
          status: TurboProjectItemStatus.APPROVED,
          scheduledAt: new Date(),
          reviewItemId: 'review-1',
        }),
      ]);
      prisma.turboRunItem.findMany.mockResolvedValue([
        { id: 'review-1', reviewDecision: decision },
      ]);
      await service.syncReviewDecisions('project-1', 'org-1');
      expect(
        prisma.turboProjectItem.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('scheduledAt');
      expect(updatedItem('item-1')).toContainEqual(
        expect.objectContaining({
          scheduledAt: null,
          status:
            decision === 'REJECTED'
              ? TurboProjectItemStatus.REJECTED
              : TurboProjectItemStatus.READY,
        }),
      );
    },
  );

  it('carries caption edits made in the review inbox back onto the item', async () => {
    useProject(makeProject([], { status: TurboProjectStatus.REVIEWING }));
    prisma.turboProjectItem.findMany.mockResolvedValue([
      makeItem({
        caption: 'Original caption',
        postId: 'post-1',
        reviewItemId: 'review-1',
        status: TurboProjectItemStatus.READY,
      }),
    ]);
    prisma.turboRunItem.findMany.mockResolvedValue([
      { id: 'review-1', reviewDecision: 'APPROVED' },
    ]);
    prisma.post.findMany.mockResolvedValue([
      { description: 'Rewritten in the inbox', id: 'post-1' },
    ]);

    await service.reconcileProject('project-1', 'org-1');

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['post-1'] },
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(updatedItem('item-1')).toContainEqual(
      expect.objectContaining({ caption: 'Rewritten in the inbox' }),
    );
  });

  it('does nothing while another reconcile holds the project', async () => {
    cacheService.withLock.mockResolvedValueOnce(null);

    await service.reconcileProject('project-1', 'org-1');

    expect(prisma.turboProject.findFirst).not.toHaveBeenCalled();
  });

  it('sweeps generating projects across organizations and survives one failure', async () => {
    prisma.turboProject.findMany.mockResolvedValue([
      { id: 'project-a', organizationId: 'org-a' },
      { id: 'project-b', organizationId: 'org-b' },
    ]);
    prisma.turboProject.findFirst
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(null);

    await expect(service.reconcileGeneratingProjects()).resolves.toBe(2);

    expect(prisma.turboProject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isDeleted: false, status: TurboProjectStatus.GENERATING },
      }),
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('sweeps every generating project, page by page, not only the oldest ones', async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => ({
      id: `project-${String(index).padStart(3, '0')}`,
      organizationId: 'org-1',
    }));
    prisma.turboProject.findMany
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([
        { id: 'project-newest', organizationId: 'org-2' },
      ])
      .mockResolvedValueOnce([]);
    prisma.turboProject.findFirst.mockResolvedValue(null);

    await expect(service.reconcileGeneratingProjects()).resolves.toBe(51);

    expect(cacheService.withLock).toHaveBeenCalledWith(
      'turbo-project-reconcile:project-newest',
      expect.any(Function),
      expect.any(Number),
    );
    expect(prisma.turboProject.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        orderBy: { id: 'asc' },
        where: expect.objectContaining({ id: { gt: 'project-049' } }),
      }),
    );
    expect(prisma.turboProject.findMany.mock.calls[1][0]).not.toHaveProperty(
      'skip',
    );
  });

  it.each([
    [
      'a start',
      { retryCount: 0, workflowItemIndex: 1 },
      (dispatchedAt: Date) =>
        `turbo-project:project-1:start:${dispatchedAt.toISOString()}`,
    ],
    [
      'a retry',
      { retryCount: 2, workflowItemIndex: 0 },
      () => 'turbo-project-item:item-1:retry:2',
    ],
  ])(
    'recovers the run of %s whose execution link was never saved',
    async (_label, overrides, keyOf) => {
      const dispatchedAt = new Date(
        Date.now() - UNRECORDED_RUN_TIMEOUT_MS - 1000,
      );
      useProject(
        makeProject([
          makeItem({
            dispatchedAt,
            workflowExecutionId: null,
            ...overrides,
          }),
        ]),
      );
      prisma.workflowExecution.findFirst.mockImplementation(
        async (args: { where: { id?: string; idempotencyKey?: string } }) => {
          if (args.where.idempotencyKey === keyOf(dispatchedAt)) {
            return { id: 'parent-recovered' };
          }
          return args.where.id === 'parent-recovered'
            ? {
                error: null,
                id: 'parent-recovered',
                result: {
                  metadata: {
                    batchExecution: { childWorkflowVersionId: 'version-1' },
                  },
                },
                status: WorkflowExecutionStatus.RUNNING,
              }
            : null;
        },
      );

      await service.reconcileProject('project-1', 'org-1');

      expect(prisma.workflowExecution.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            idempotencyKey: keyOf(dispatchedAt),
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
      expect(updatedItem('item-1')).toContainEqual({
        workflowExecutionId: 'parent-recovered',
      });
      expect(updatedItem('item-1')).not.toContainEqual(
        expect.objectContaining({ status: TurboProjectItemStatus.FAILED }),
      );
    },
  );

  it('fails a workflow item whose run never got recorded', async () => {
    prisma.workflowExecution.findFirst.mockResolvedValue(null);
    useProject(
      makeProject([
        makeItem({
          dispatchedAt: new Date(Date.now() - UNRECORDED_RUN_TIMEOUT_MS - 1000),
          workflowExecutionId: null,
          workflowItemIndex: null,
        }),
      ]),
    );

    await service.reconcileProject('project-1', 'org-1');

    expect(updatedItem('item-1')).toContainEqual({
      error: 'The workflow run did not start. Retry this item.',
      status: TurboProjectItemStatus.FAILED,
    });
  });

  describe('runExclusive', () => {
    it('runs the operation holding the reconcile lock of the project', async () => {
      cacheService.acquireLock.mockResolvedValue(true);

      await expect(
        service.runExclusive('project-1', async () => 'done'),
      ).resolves.toBe('done');

      expect(cacheService.acquireLock).toHaveBeenCalledWith(
        'turbo-project-reconcile:project-1',
        expect.any(Number),
      );
      expect(cacheService.releaseLock).toHaveBeenCalledWith(
        'turbo-project-reconcile:project-1',
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
