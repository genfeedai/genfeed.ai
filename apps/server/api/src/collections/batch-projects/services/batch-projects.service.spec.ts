import { BatchProjectsService } from '@api/collections/batch-projects/services/batch-projects.service';
import {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
  IngredientCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

type Row = Record<string, unknown>;

const scope = { organizationId: 'org-1', userId: 'user-1' };
const now = new Date('2026-09-28T12:00:00Z');

function makeProject(overrides: Row = {}): Row {
  return {
    brandId: 'brand-1',
    createdAt: now,
    id: 'project-1',
    isDeleted: false,
    kind: BatchProjectKind.WORKFLOW,
    name: 'Product shots',
    organizationId: 'org-1',
    reviewBatchId: null,
    settings: {},
    status: BatchProjectStatus.DRAFT,
    step: BatchProjectStep.INPUTS,
    updatedAt: now,
    userId: 'user-1',
    workflowId: 'workflow-1',
    ...overrides,
  };
}

function makeItem(overrides: Row = {}): Row {
  return {
    caption: null,
    createdAt: now,
    dispatchedAt: null,
    error: null,
    id: 'item-1',
    idea: null,
    inputCategory: IngredientCategory.IMAGE,
    inputIngredientId: 'input-1',
    isDeleted: false,
    organizationId: 'org-1',
    outputCategory: null,
    outputIngredientId: null,
    position: 0,
    postId: null,
    projectId: 'project-1',
    reviewBatchId: null,
    retryCount: 0,
    reviewItemId: null,
    scheduledAt: null,
    scheduledTargets: [],
    status: BatchProjectItemStatus.PENDING,
    updatedAt: now,
    workflowExecutionId: null,
    workflowItemIndex: null,
    ...overrides,
  };
}

describe('BatchProjectsService', () => {
  const prisma = {
    $transaction: vi.fn(async (operations: unknown) =>
      typeof operations === 'function'
        ? operations(prisma)
        : Promise.all(operations as unknown[]),
    ),
    batchProject: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    batchProjectItem: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    brand: { findFirst: vi.fn() },
    credential: { findMany: vi.fn() },
    ingredient: { findFirst: vi.fn(), findMany: vi.fn() },
    organizationSetting: { findFirst: vi.fn() },
    post: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  };
  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const reconcileService = {
    reconcileProject: vi.fn(),
    runExclusive: vi.fn(
      async (_projectId: string, operation: () => Promise<unknown>) =>
        await operation(),
    ),
    refreshProjectStatus: vi.fn(),
    syncReviewDecisions: vi.fn(),
  };
  const batchWorkflowExecutionService = { startBatchExecution: vi.fn() };
  const workflowsService = { findOwnedOrThrow: vi.fn() };
  const batchGenerationService = {
    approveItems: vi.fn(),
    rejectItems: vi.fn(),
  };
  const service = new BatchProjectsService(
    prisma as never,
    logger as never,
    reconcileService as never,
    batchWorkflowExecutionService as never,
    workflowsService as never,
    batchGenerationService as never,
  );

  function useProject(project: Row, items: Row[] = []) {
    prisma.batchProject.findFirst.mockResolvedValue({ ...project, items });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.batchProject.updateMany.mockResolvedValue({ count: 1 });
    prisma.batchProjectItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.batchProjectItem.createMany.mockResolvedValue({ count: 1 });
    prisma.batchProjectItem.findMany.mockResolvedValue([]);
    prisma.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    prisma.post.findFirst.mockResolvedValue(null);
    prisma.post.findMany.mockResolvedValue([]);
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('create', () => {
    it('keeps idea batches behind the organization flag', async () => {
      prisma.organizationSetting.findFirst.mockResolvedValue({
        isFastlaneEnabled: false,
      });

      await expect(
        service.create(
          { brandId: 'brand-1', kind: BatchProjectKind.IDEAS },
          scope,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.batchProject.create).not.toHaveBeenCalled();
    });

    it('opens an idea batch on the ideas step with default idea choices', async () => {
      prisma.organizationSetting.findFirst.mockResolvedValue({
        isFastlaneEnabled: true,
      });
      prisma.batchProject.create.mockImplementation(async ({ data }) => ({
        ...makeProject(),
        ...data,
      }));

      const project = await service.create(
        { brandId: 'brand-1', kind: BatchProjectKind.IDEAS },
        scope,
      );

      expect(prisma.batchProject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          status: BatchProjectStatus.DRAFT,
          step: BatchProjectStep.IDEAS,
          userId: 'user-1',
        }),
      });
      expect(project.settings.ideas).toEqual({
        count: 6,
        formats: ['image', 'video'],
      });
    });

    it('rejects a brand outside the organization', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { brandId: 'brand-other', kind: BatchProjectKind.WORKFLOW },
          scope,
        ),
      ).rejects.toThrow('Brand');
      expect(prisma.brand.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
    });
  });

  describe('addItems', () => {
    it('persists image and video inputs once each, after existing ones', async () => {
      useProject(makeProject());
      prisma.ingredient.findMany.mockResolvedValue([
        { category: IngredientCategory.IMAGE, id: 'input-1' },
        { category: IngredientCategory.VIDEO, id: 'input-2' },
      ]);
      prisma.batchProjectItem.findMany.mockResolvedValue([
        { inputIngredientId: 'input-1', position: 0 },
      ]);

      await service.addItems(
        'project-1',
        {
          inputs: [
            { ingredientId: 'input-1' },
            { ingredientId: 'input-2' },
            { ingredientId: 'input-2' },
          ],
        },
        scope,
      );

      expect(prisma.batchProjectItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            inputCategory: IngredientCategory.VIDEO,
            inputIngredientId: 'input-2',
            organizationId: 'org-1',
            position: 1,
            status: BatchProjectItemStatus.PENDING,
          }),
        ],
      });
    });

    it('rejects inputs that are not images or videos', async () => {
      useProject(makeProject());
      prisma.ingredient.findMany.mockResolvedValue([
        { category: IngredientCategory.MUSIC, id: 'input-1' },
      ]);

      await expect(
        service.addItems(
          'project-1',
          { inputs: [{ ingredientId: 'input-1' }] },
          scope,
        ),
      ).rejects.toThrow('Workflow batches accept images and videos');
    });

    it('changes inputs under the project lock and rechecks the draft inside it', async () => {
      useProject(makeProject());
      reconcileService.runExclusive.mockImplementationOnce(
        async (_projectId: string, operation: () => Promise<unknown>) => {
          // A start wins the lock first.
          useProject(makeProject({ status: BatchProjectStatus.GENERATING }));
          return await operation();
        },
      );

      await expect(
        service.addItems(
          'project-1',
          { inputs: [{ ingredientId: 'input-1' }] },
          scope,
        ),
      ).rejects.toThrow('Inputs can only change before the batch starts');
      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
      expect(prisma.batchProjectItem.createMany).not.toHaveBeenCalled();
    });

    it('removes an input under the project lock', async () => {
      useProject(makeProject());
      prisma.batchProjectItem.findFirst.mockResolvedValue(makeItem());

      await service.removeItem('project-1', 'item-1', scope);

      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
    });

    it('refuses to change inputs once the batch started', async () => {
      useProject(makeProject({ status: BatchProjectStatus.GENERATING }));

      await expect(
        service.addItems(
          'project-1',
          { inputs: [{ ingredientId: 'input-1' }] },
          scope,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateItem', () => {
    it('writes a caption edit to the review draft so both surfaces agree', async () => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }));
      prisma.batchProjectItem.findFirst.mockResolvedValue(
        makeItem({
          postId: 'review-post-1',
          status: BatchProjectItemStatus.READY,
        }),
      );

      await service.updateItem(
        'project-1',
        'item-1',
        { caption: 'Edited in Batch' },
        scope,
      );

      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        data: { description: 'Edited in Batch' },
        where: expect.objectContaining({
          id: 'review-post-1',
          isDeleted: false,
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.DRAFT,
        }),
      });
    });
  });

  describe('list', () => {
    it('refreshes review decisions of projects in review before counting', async () => {
      prisma.batchProject.findMany.mockResolvedValue([
        { ...makeProject({ status: BatchProjectStatus.REVIEWING }), items: [] },
      ]);
      prisma.batchProject.count.mockResolvedValue(1);

      await service.list(scope, { limit: 20, page: 1 } as never);

      expect(reconcileService.syncReviewDecisions).toHaveBeenCalledWith(
        'project-1',
        'org-1',
      );
      expect(prisma.batchProject.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('start', () => {
    it('claims the draft and runs the workflow once for every input', async () => {
      useProject(makeProject(), [
        makeItem(),
        makeItem({ id: 'item-2', inputIngredientId: 'input-2', position: 1 }),
      ]);
      batchWorkflowExecutionService.startBatchExecution.mockResolvedValue(
        'parent-1',
      );

      await service.start('project-1', scope);

      expect(prisma.batchProject.updateMany).toHaveBeenCalledWith({
        data: {
          status: BatchProjectStatus.GENERATING,
          step: BatchProjectStep.REVIEW,
        },
        where: expect.objectContaining({
          id: 'project-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: BatchProjectStatus.DRAFT,
        }),
      });
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).toHaveBeenCalledWith({
        idempotencyKey: expect.stringMatching(
          /^batch-project:project-1:start:/,
        ),
        ingredientIds: ['input-1', 'input-2'],
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      });
      expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: BatchProjectItemStatus.GENERATING,
          workflowExecutionId: 'parent-1',
          workflowItemIndex: 1,
        }),
        where: expect.objectContaining({ id: 'item-2' }),
      });
    });

    it('starts under the project lock and claims project and items together', async () => {
      useProject(makeProject(), [makeItem()]);
      batchWorkflowExecutionService.startBatchExecution.mockResolvedValue(
        'parent-1',
      );

      await service.start('project-1', scope);

      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
      const claimOrder =
        prisma.batchProject.updateMany.mock.invocationCallOrder[0];
      const itemsClaimOrder =
        prisma.batchProjectItem.updateMany.mock.invocationCallOrder[0];
      const enqueueOrder =
        batchWorkflowExecutionService.startBatchExecution.mock
          .invocationCallOrder[0];
      // Each item's index is claimed with it, so a lost execution link can
      // be recovered from the run's deterministic key.
      expect(prisma.batchProjectItem.updateMany).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          status: BatchProjectItemStatus.GENERATING,
          workflowExecutionId: null,
          workflowItemIndex: 0,
        }),
        where: expect.objectContaining({
          id: 'item-1',
          status: BatchProjectItemStatus.PENDING,
        }),
      });
      expect(claimOrder).toBeLessThan(enqueueOrder);
      expect(itemsClaimOrder).toBeLessThan(enqueueOrder);
    });

    it('refuses a second start of the same batch', async () => {
      useProject(makeProject(), [makeItem()]);
      prisma.batchProject.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.start('project-1', scope)).rejects.toThrow(
        ConflictException,
      );
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).not.toHaveBeenCalled();
    });

    it('returns the batch to draft when the run cannot start', async () => {
      useProject(makeProject(), [makeItem()]);
      batchWorkflowExecutionService.startBatchExecution.mockRejectedValue(
        new BadRequestException('Workflow must have an immutable version'),
      );

      await expect(service.start('project-1', scope)).rejects.toThrow(
        'immutable version',
      );
      expect(prisma.batchProject.updateMany).toHaveBeenLastCalledWith({
        data: {
          status: BatchProjectStatus.DRAFT,
          step: BatchProjectStep.INPUTS,
        },
        where: expect.objectContaining({ id: 'project-1' }),
      });
    });
  });

  describe('retryItem', () => {
    it('reruns only the failed workflow input', async () => {
      useProject(makeProject({ status: BatchProjectStatus.PARTIAL_FAILURE }));
      prisma.batchProjectItem.findFirst.mockResolvedValue(
        makeItem({
          error: 'Upscaler timed out',
          status: BatchProjectItemStatus.FAILED,
          workflowExecutionId: 'parent-1',
          workflowItemIndex: 3,
        }),
      );
      batchWorkflowExecutionService.startBatchExecution.mockResolvedValue(
        'retry-parent',
      );

      await service.retryItem('project-1', 'item-1', scope);

      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ ingredientIds: ['input-1'] }),
      );
      expect(prisma.batchProjectItem.updateMany).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          error: null,
          outputIngredientId: null,
          retryCount: 1,
          status: BatchProjectItemStatus.GENERATING,
          workflowExecutionId: null,
          workflowItemIndex: 0,
        }),
        where: expect.objectContaining({
          id: 'item-1',
          retryCount: 0,
          status: BatchProjectItemStatus.FAILED,
        }),
      });
      expect(prisma.batchProjectItem.updateMany).toHaveBeenNthCalledWith(2, {
        data: { workflowExecutionId: 'retry-parent', workflowItemIndex: 0 },
        where: expect.objectContaining({ id: 'item-1', retryCount: 1 }),
      });
      expect(reconcileService.refreshProjectStatus).toHaveBeenCalledWith(
        'project-1',
        'org-1',
      );
    });

    it('claims the failed item before running the workflow again', async () => {
      useProject(makeProject({ status: BatchProjectStatus.PARTIAL_FAILURE }));
      prisma.batchProjectItem.findFirst.mockResolvedValue(
        makeItem({ retryCount: 2, status: BatchProjectItemStatus.FAILED }),
      );
      prisma.batchProjectItem.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.retryItem('project-1', 'item-1', scope),
      ).rejects.toThrow(ConflictException);
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).not.toHaveBeenCalled();
    });

    it('runs each retry attempt under its own idempotency key and the project lock', async () => {
      useProject(makeProject({ status: BatchProjectStatus.PARTIAL_FAILURE }));
      prisma.batchProjectItem.findFirst.mockResolvedValue(
        makeItem({ retryCount: 2, status: BatchProjectItemStatus.FAILED }),
      );
      batchWorkflowExecutionService.startBatchExecution.mockResolvedValue(
        'retry-parent',
      );

      await service.retryItem('project-1', 'item-1', scope);

      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'batch-project-item:item-1:retry:3',
        }),
      );
      expect(
        prisma.batchProjectItem.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        batchWorkflowExecutionService.startBatchExecution.mock
          .invocationCallOrder[0],
      );
    });

    it('returns the item to failed when the retry cannot start', async () => {
      useProject(makeProject({ status: BatchProjectStatus.PARTIAL_FAILURE }));
      prisma.batchProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: BatchProjectItemStatus.FAILED }),
      );
      batchWorkflowExecutionService.startBatchExecution.mockRejectedValue(
        new Error('Queue unavailable'),
      );

      await expect(
        service.retryItem('project-1', 'item-1', scope),
      ).rejects.toThrow('Queue unavailable');
      expect(prisma.batchProjectItem.updateMany).toHaveBeenLastCalledWith({
        data: {
          error: 'Queue unavailable',
          status: BatchProjectItemStatus.FAILED,
        },
        where: expect.objectContaining({
          id: 'item-1',
          retryCount: 1,
          status: BatchProjectItemStatus.GENERATING,
        }),
      });
    });

    it('only retries failed items', async () => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }));
      prisma.batchProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: BatchProjectItemStatus.READY }),
      );

      await expect(
        service.retryItem('project-1', 'item-1', scope),
      ).rejects.toThrow('Only a failed item can be retried');
    });
  });

  describe('dispatchItem', () => {
    it('records the pending ingredient of an idea item', async () => {
      useProject(
        makeProject({
          kind: BatchProjectKind.IDEAS,
          status: BatchProjectStatus.GENERATING,
        }),
      );
      prisma.batchProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: BatchProjectItemStatus.GENERATING }),
      );
      prisma.ingredient.findFirst.mockResolvedValue({
        category: IngredientCategory.VIDEO,
        id: 'pending-1',
      });

      await service.dispatchItem(
        'project-1',
        'item-1',
        { ingredientId: 'pending-1' },
        scope,
      );

      expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
        data: {
          outputCategory: IngredientCategory.VIDEO,
          outputIngredientId: 'pending-1',
        },
        where: expect.objectContaining({
          id: 'item-1',
          organizationId: 'org-1',
          outputIngredientId: null,
        }),
      });
    });
  });

  describe('review', () => {
    it('records the decision in the review inbox and mirrors it back', async () => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }));
      prisma.batchProjectItem.findMany.mockResolvedValue([
        makeItem({
          reviewBatchId: 'review-batch-1',
          reviewItemId: 'review-item-1',
          status: BatchProjectItemStatus.READY,
        }),
      ]);

      await service.review(
        'project-1',
        { decision: 'approved', itemIds: ['item-1'] },
        scope,
      );

      expect(batchGenerationService.approveItems).toHaveBeenCalledWith(
        'review-batch-1',
        ['review-item-1'],
        'org-1',
        'user-1',
      );
      expect(reconcileService.syncReviewDecisions).toHaveBeenCalledWith(
        'project-1',
        'org-1',
      );
    });

    it('refuses to approve an item the inbox already rejected', async () => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }));
      prisma.batchProjectItem.findMany.mockResolvedValue([
        makeItem({
          reviewBatchId: 'review-batch-1',
          reviewItemId: 'review-item-1',
          status: BatchProjectItemStatus.REJECTED,
        }),
      ]);

      await expect(
        service.review(
          'project-1',
          { decision: 'approved', itemIds: ['item-1'] },
          scope,
        ),
      ).rejects.toThrow(ConflictException);
      expect(batchGenerationService.approveItems).not.toHaveBeenCalled();
    });

    it('rejects through the review inbox', async () => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }));
      prisma.batchProjectItem.findMany.mockResolvedValue([
        makeItem({
          reviewBatchId: 'review-batch-1',
          reviewItemId: 'review-item-1',
          status: BatchProjectItemStatus.APPROVED,
        }),
      ]);

      await service.review(
        'project-1',
        { decision: 'rejected', itemIds: ['item-1'] },
        scope,
      );

      expect(batchGenerationService.rejectItems).toHaveBeenCalledWith(
        'review-batch-1',
        ['review-item-1'],
        'org-1',
        undefined,
        'user-1',
      );
    });
  });
});
