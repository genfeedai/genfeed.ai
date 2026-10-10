import { TurboProjectsService } from '@api/collections/turbo-projects/services/turbo-projects.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import {
  IngredientCategory,
  TargetExecutionState,
  TurboProjectItemStatus,
  TurboProjectKind,
  TurboProjectStatus,
  TurboProjectStep,
} from '@genfeedai/contracts';
import { BadRequestException, ConflictException } from '@nestjs/common';

type Row = Record<string, unknown>;

const scope = { organizationId: 'org-1', userId: 'user-1' };
const now = new Date('2026-09-28T12:00:00Z');

function makeProject(overrides: Row = {}): Row {
  return {
    brandId: 'brand-1',
    createdAt: now,
    id: 'project-1',
    isDeleted: false,
    kind: TurboProjectKind.WORKFLOW,
    name: 'Product shots',
    organizationId: 'org-1',
    reviewTurboRunId: null,
    settings: {},
    status: TurboProjectStatus.DRAFT,
    step: TurboProjectStep.INPUTS,
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
    reviewTurboRunId: null,
    retryCount: 0,
    reviewItemId: null,
    scheduledAt: null,
    scheduledTargets: [],
    status: TurboProjectItemStatus.PENDING,
    updatedAt: now,
    workflowExecutionId: null,
    workflowItemIndex: null,
    ...overrides,
  };
}

describe('TurboProjectsService', () => {
  const prisma = {
    $transaction: vi.fn(async (operations: unknown) =>
      typeof operations === 'function'
        ? operations(prisma)
        : Promise.all(operations as unknown[]),
    ),
    turboProject: {
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    turboProjectItem: {
      count: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    brand: { findFirst: vi.fn() },
    credential: { findMany: vi.fn() },
    ingredient: { findFirst: vi.fn(), findMany: vi.fn() },
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
    syncReviewState: vi.fn(),
  };
  const batchWorkflowExecutionService = { startBatchExecution: vi.fn() };
  const workflowsService = { findOwnedOrThrow: vi.fn() };
  const turboRunService = {
    approveItems: vi.fn(),
    rejectItems: vi.fn(),
  };
  const ideaGeneration = { quote: vi.fn(), retry: vi.fn(), start: vi.fn() };
  const platformSettingsService = { getFeatureSettings: vi.fn() };
  const service = new TurboProjectsService(
    prisma as never,
    logger as never,
    reconcileService as never,
    batchWorkflowExecutionService as never,
    workflowsService as never,
    turboRunService as never,
    ideaGeneration as never,
    { generateTurboIdeas: vi.fn() } as never,
    platformSettingsService as never,
  );

  function useProject(project: Row, items: Row[] = []) {
    prisma.turboProject.findFirst.mockResolvedValue({ ...project, items });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    reconcileService.syncReviewDecisions.mockReset();
    reconcileService.runExclusive.mockImplementation(
      async (_projectId: string, operation: () => Promise<unknown>) =>
        await operation(),
    );
    prisma.turboProject.updateMany.mockResolvedValue({ count: 1 });
    prisma.turboProjectItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.turboProjectItem.createMany.mockResolvedValue({ count: 1 });
    prisma.turboProjectItem.findMany.mockResolvedValue([]);
    prisma.brand.findFirst.mockResolvedValue({ id: 'brand-1' });
    prisma.post.findFirst.mockResolvedValue(null);
    prisma.post.findMany.mockResolvedValue([]);
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
    platformSettingsService.getFeatureSettings.mockResolvedValue({
      flags: { turbo_ideas: true },
    });
  });

  describe('create', () => {
    it('keeps idea projects behind the turbo_ideas platform flag', async () => {
      platformSettingsService.getFeatureSettings.mockResolvedValue({
        flags: { turbo_ideas: false },
      });

      await expect(
        service.create(
          { brandId: 'brand-1', kind: TurboProjectKind.IDEAS },
          scope,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.turboProject.create).not.toHaveBeenCalled();
    });

    it('lets a superadmin open an idea project while turbo_ideas is off', async () => {
      platformSettingsService.getFeatureSettings.mockResolvedValue({
        flags: { turbo_ideas: false },
      });
      prisma.turboProject.create.mockImplementation(async ({ data }) => ({
        ...makeProject(),
        ...data,
      }));

      await service.create(
        { brandId: 'brand-1', kind: TurboProjectKind.IDEAS },
        { ...scope, isSuperAdmin: true },
      );

      expect(prisma.turboProject.create).toHaveBeenCalled();
    });

    it('opens an idea project on the ideas step with default idea choices', async () => {
      prisma.turboProject.create.mockImplementation(async ({ data }) => ({
        ...makeProject(),
        ...data,
      }));

      const project = await service.create(
        { brandId: 'brand-1', kind: TurboProjectKind.IDEAS },
        scope,
      );

      expect(prisma.turboProject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          status: TurboProjectStatus.DRAFT,
          step: TurboProjectStep.IDEAS,
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
          { brandId: 'brand-other', kind: TurboProjectKind.WORKFLOW },
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
      prisma.turboProjectItem.findMany.mockResolvedValue([
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

      expect(prisma.turboProjectItem.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            inputCategory: IngredientCategory.VIDEO,
            inputIngredientId: 'input-2',
            organizationId: 'org-1',
            position: 1,
            status: TurboProjectItemStatus.PENDING,
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
      ).rejects.toThrow('Workflow projects accept images and videos');
    });

    it('changes inputs under the project lock and rechecks the draft inside it', async () => {
      useProject(makeProject());
      reconcileService.runExclusive.mockImplementationOnce(
        async (_projectId: string, operation: () => Promise<unknown>) => {
          // A start wins the lock first.
          useProject(makeProject({ status: TurboProjectStatus.GENERATING }));
          return await operation();
        },
      );

      await expect(
        service.addItems(
          'project-1',
          { inputs: [{ ingredientId: 'input-1' }] },
          scope,
        ),
      ).rejects.toThrow('Inputs can only change before the project starts');
      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
      expect(prisma.turboProjectItem.createMany).not.toHaveBeenCalled();
    });

    it('removes an input under the project lock', async () => {
      useProject(makeProject());
      prisma.turboProjectItem.findFirst.mockResolvedValue(makeItem());

      await service.removeItem('project-1', 'item-1', scope);

      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
    });

    it('refuses to change inputs once the project started', async () => {
      useProject(makeProject({ status: TurboProjectStatus.GENERATING }));

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
      useProject(makeProject({ status: TurboProjectStatus.REVIEWING }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({
          postId: 'review-post-1',
          status: TurboProjectItemStatus.READY,
        }),
      );

      await service.updateItem(
        'project-1',
        'item-1',
        { caption: 'Edited in Turbo' },
        scope,
      );

      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        data: { description: 'Edited in Turbo' },
        where: expect.objectContaining({
          id: 'review-post-1',
          isDeleted: false,
          organizationId: 'org-1',
          targetExecutionState: TargetExecutionState.DRAFT,
        }),
      });
    });

    it('waits for a scheduling run holding the project lock before editing', async () => {
      // A real per-project mutex in place of the Redis lock.
      let held: Promise<unknown> = Promise.resolve();
      reconcileService.runExclusive.mockImplementation(
        (_projectId: string, operation: () => Promise<unknown>) => {
          const run = held.then(operation);
          held = run.catch(() => undefined);
          return run;
        },
      );
      useProject(makeProject({ status: TurboProjectStatus.REVIEWING }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({
          postId: 'review-post-1',
          status: TurboProjectItemStatus.APPROVED,
        }),
      );
      let finishSchedule: () => void = () => undefined;
      const events: string[] = [];
      const scheduling = reconcileService.runExclusive(
        'project-1',
        () =>
          new Promise<void>((resolve) => {
            events.push('schedule-read-caption');
            finishSchedule = () => {
              events.push('schedule-published');
              resolve();
            };
          }),
      );
      prisma.turboProjectItem.updateMany.mockImplementation(async () => {
        events.push('caption-write');
        return { count: 1 };
      });

      const editing = service.updateItem(
        'project-1',
        'item-1',
        { caption: 'Edited mid-schedule' },
        scope,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(events).toEqual(['schedule-read-caption']);

      finishSchedule();
      await Promise.all([scheduling, editing]);
      expect(events).toEqual([
        'schedule-read-caption',
        'schedule-published',
        'caption-write',
      ]);
    });
  });

  describe('update', () => {
    it('changes the workflow under the project lock, only while a draft', async () => {
      useProject(makeProject());
      workflowsService.findOwnedOrThrow.mockResolvedValue({ id: 'workflow-2' });

      await service.update('project-1', { workflowId: 'workflow-2' }, scope);

      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
      expect(prisma.turboProject.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ workflowId: 'workflow-2' }),
        where: expect.objectContaining({
          id: 'project-1',
          status: TurboProjectStatus.DRAFT,
        }),
      });
    });
  });

  describe('list', () => {
    it('returns the pagination fields the collection serializer reads', async () => {
      prisma.turboProject.findMany.mockResolvedValue([
        { ...makeProject(), items: [] },
      ]);
      prisma.turboProject.count.mockResolvedValue(45);

      const result = await service.list(scope, { limit: 20, page: 2 } as never);

      expect(result).toEqual(
        expect.objectContaining({
          hasNextPage: true,
          hasPrevPage: true,
          limit: 20,
          page: 2,
          totalDocs: 45,
          totalPages: 3,
        }),
      );
    });

    it('refreshes review decisions of projects in review before counting', async () => {
      prisma.turboProject.findMany.mockResolvedValue([
        { ...makeProject({ status: TurboProjectStatus.REVIEWING }), items: [] },
      ]);
      prisma.turboProject.count.mockResolvedValue(1);

      await service.list(scope, { limit: 20, page: 1 } as never);

      // Synced under the project's lock, never alongside scheduling.
      expect(reconcileService.syncReviewState).toHaveBeenCalledWith(
        'project-1',
        'org-1',
      );
      expect(prisma.turboProject.findMany).toHaveBeenCalledTimes(2);
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

      expect(prisma.turboProject.updateMany).toHaveBeenCalledWith({
        data: {
          status: TurboProjectStatus.GENERATING,
          step: TurboProjectStep.REVIEW,
        },
        where: expect.objectContaining({
          id: 'project-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: TurboProjectStatus.DRAFT,
        }),
      });
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).toHaveBeenCalledWith({
        idempotencyKey: expect.stringMatching(
          /^turboRun-project:project-1:start:/,
        ),
        ingredientIds: ['input-1', 'input-2'],
        organizationId: 'org-1',
        userId: 'user-1',
        workflowId: 'workflow-1',
      });
      expect(prisma.turboProjectItem.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: TurboProjectItemStatus.GENERATING,
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
        prisma.turboProject.updateMany.mock.invocationCallOrder[0];
      const itemsClaimOrder =
        prisma.turboProjectItem.updateMany.mock.invocationCallOrder[0];
      const enqueueOrder =
        batchWorkflowExecutionService.startBatchExecution.mock
          .invocationCallOrder[0];
      // Each item's index is claimed with it, so a lost execution link can
      // be recovered from the run's deterministic key.
      expect(prisma.turboProjectItem.updateMany).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          status: TurboProjectItemStatus.GENERATING,
          workflowExecutionId: null,
          workflowItemIndex: 0,
        }),
        where: expect.objectContaining({
          id: 'item-1',
          status: TurboProjectItemStatus.PENDING,
        }),
      });
      expect(claimOrder).toBeLessThan(enqueueOrder);
      expect(itemsClaimOrder).toBeLessThan(enqueueOrder);
    });

    it('refuses a second start of the same project', async () => {
      useProject(makeProject(), [makeItem()]);
      prisma.turboProject.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.start('project-1', scope)).rejects.toThrow(
        ConflictException,
      );
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).not.toHaveBeenCalled();
    });

    it('returns the project to draft when the run cannot start', async () => {
      useProject(makeProject(), [makeItem()]);
      batchWorkflowExecutionService.startBatchExecution.mockRejectedValue(
        new BadRequestException('Workflow must have an immutable version'),
      );

      await expect(service.start('project-1', scope)).rejects.toThrow(
        'immutable version',
      );
      expect(prisma.turboProject.updateMany).toHaveBeenLastCalledWith({
        data: {
          status: TurboProjectStatus.DRAFT,
          step: TurboProjectStep.INPUTS,
        },
        where: expect.objectContaining({ id: 'project-1' }),
      });
    });
  });

  describe('retryItem', () => {
    it('commits the item claim and generating project before dispatch', async () => {
      useProject(makeProject({ status: TurboProjectStatus.PARTIAL_FAILURE }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: TurboProjectItemStatus.FAILED }),
      );
      const events: string[] = [];
      prisma.$transaction.mockImplementationOnce(async (operation: unknown) => {
        if (typeof operation !== 'function')
          throw new Error('Expected a transaction');
        events.push('begin');
        const result = await operation(prisma);
        expect(prisma.turboProject.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: TurboProjectStatus.GENERATING,
            }),
          }),
        );
        events.push('commit');
        return result;
      });
      batchWorkflowExecutionService.startBatchExecution.mockImplementationOnce(
        async () => {
          events.push('dispatch');
          return 'retry-parent';
        },
      );
      await service.retryItem('project-1', 'item-1', scope);
      expect(events).toEqual(['begin', 'commit', 'dispatch']);
    });
    it('does not dispatch when the atomic project transition fails', async () => {
      useProject(makeProject({ status: TurboProjectStatus.PARTIAL_FAILURE }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: TurboProjectItemStatus.FAILED }),
      );
      prisma.turboProject.updateMany.mockRejectedValueOnce(
        new Error('write failed'),
      );
      await expect(
        service.retryItem('project-1', 'item-1', scope),
      ).rejects.toThrow('write failed');
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).not.toHaveBeenCalled();
    });

    it('keeps a started retry generating when saving its run link fails', async () => {
      useProject(makeProject({ status: TurboProjectStatus.PARTIAL_FAILURE }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: TurboProjectItemStatus.FAILED }),
      );
      batchWorkflowExecutionService.startBatchExecution.mockResolvedValue(
        'retry-parent',
      );
      prisma.turboProjectItem.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockRejectedValueOnce(new Error('connection reset'));

      await service.retryItem('project-1', 'item-1', scope);

      expect(prisma.turboProjectItem.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TurboProjectItemStatus.FAILED,
          }),
        }),
      );
      expect(logger.warn).toHaveBeenCalled();
    });

    it('reruns only the failed workflow input', async () => {
      useProject(makeProject({ status: TurboProjectStatus.PARTIAL_FAILURE }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({
          error: 'Upscaler timed out',
          status: TurboProjectItemStatus.FAILED,
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
      expect(prisma.turboProjectItem.updateMany).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          error: null,
          outputIngredientId: null,
          retryCount: 1,
          status: TurboProjectItemStatus.GENERATING,
          workflowExecutionId: null,
          workflowItemIndex: 0,
        }),
        where: expect.objectContaining({
          id: 'item-1',
          retryCount: 0,
          status: TurboProjectItemStatus.FAILED,
        }),
      });
      expect(prisma.turboProjectItem.updateMany).toHaveBeenNthCalledWith(2, {
        data: { workflowExecutionId: 'retry-parent', workflowItemIndex: 0 },
        where: expect.objectContaining({ id: 'item-1', retryCount: 1 }),
      });
      expect(reconcileService.refreshProjectStatus).toHaveBeenCalledWith(
        'project-1',
        'org-1',
      );
    });

    it('claims the failed item before running the workflow again', async () => {
      useProject(makeProject({ status: TurboProjectStatus.PARTIAL_FAILURE }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ retryCount: 2, status: TurboProjectItemStatus.FAILED }),
      );
      prisma.turboProjectItem.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.retryItem('project-1', 'item-1', scope),
      ).rejects.toThrow(ConflictException);
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).not.toHaveBeenCalled();
    });

    it('runs each retry attempt under its own idempotency key and the project lock', async () => {
      useProject(makeProject({ status: TurboProjectStatus.PARTIAL_FAILURE }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ retryCount: 2, status: TurboProjectItemStatus.FAILED }),
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
          idempotencyKey: 'turbo-project-item:item-1:retry:3',
        }),
      );
      expect(
        prisma.turboProjectItem.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(
        batchWorkflowExecutionService.startBatchExecution.mock
          .invocationCallOrder[0],
      );
    });

    it('returns the item to failed when the retry cannot start', async () => {
      useProject(makeProject({ status: TurboProjectStatus.PARTIAL_FAILURE }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: TurboProjectItemStatus.FAILED }),
      );
      batchWorkflowExecutionService.startBatchExecution.mockRejectedValue(
        new Error('Queue unavailable'),
      );

      await expect(
        service.retryItem('project-1', 'item-1', scope),
      ).rejects.toThrow('Queue unavailable');
      expect(prisma.turboProjectItem.updateMany).toHaveBeenLastCalledWith({
        data: {
          error: 'Queue unavailable',
          status: TurboProjectItemStatus.FAILED,
        },
        where: expect.objectContaining({
          id: 'item-1',
          retryCount: 1,
          status: TurboProjectItemStatus.GENERATING,
        }),
      });
    });

    it('only retries failed items', async () => {
      useProject(makeProject({ status: TurboProjectStatus.REVIEWING }));
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: TurboProjectItemStatus.READY }),
      );

      await expect(
        service.retryItem('project-1', 'item-1', scope),
      ).rejects.toThrow('Only a failed item can be retried');
    });
  });

  describe('ideas', () => {
    it.each(['quote', 'start', 'retry'] as const)(
      'rejects disabled existing-project idea %s before delegating',
      async (operation) => {
        platformSettingsService.getFeatureSettings.mockResolvedValue({
          flags: { turbo_ideas: false },
        });
        useProject(makeProject({ kind: TurboProjectKind.IDEAS }), [makeItem()]);
        prisma.turboProjectItem.findFirst.mockResolvedValue(
          makeItem({ status: TurboProjectItemStatus.FAILED }),
        );
        const result =
          operation === 'quote'
            ? service.quote('project-1', {}, scope)
            : operation === 'start'
              ? service.start('project-1', scope, 'quote-1')
              : service.retryItem('project-1', 'item-1', scope, 'quote-1');
        await expect(result).rejects.toThrow('Idea projects are not enabled');
        expect(ideaGeneration[operation]).not.toHaveBeenCalled();
        expect(prisma.turboProject.updateMany).not.toHaveBeenCalled();
      },
    );

    it.each(['quote', 'start', 'retry'] as const)(
      'lets a superadmin %s an idea project while turbo_ideas is off',
      async (operation) => {
        platformSettingsService.getFeatureSettings.mockResolvedValue({
          flags: { turbo_ideas: false },
        });
        useProject(makeProject({ kind: TurboProjectKind.IDEAS }), [makeItem()]);
        prisma.turboProjectItem.findFirst.mockResolvedValue(
          makeItem({ status: TurboProjectItemStatus.FAILED }),
        );
        const admin = { ...scope, isSuperAdmin: true };
        if (operation === 'quote') {
          await service.quote('project-1', {}, admin);
        } else if (operation === 'start') {
          await service.start('project-1', admin, 'quote-1');
        } else {
          await service.retryItem('project-1', 'item-1', admin, 'quote-1');
        }
        expect(ideaGeneration[operation]).toHaveBeenCalled();
        expect(
          platformSettingsService.getFeatureSettings,
        ).not.toHaveBeenCalled();
      },
    );

    it('starts an idea project through its accepted quote', async () => {
      useProject(makeProject({ kind: TurboProjectKind.IDEAS }), [makeItem()]);

      await service.start('project-1', scope, 'quote-1');

      expect(ideaGeneration.start).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'project-1' }),
        [expect.objectContaining({ id: 'item-1' })],
        'quote-1',
        scope,
      );
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).not.toHaveBeenCalled();
      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
    });

    it('retries a failed idea through a fresh quote', async () => {
      useProject(
        makeProject({
          kind: TurboProjectKind.IDEAS,
          status: TurboProjectStatus.PARTIAL_FAILURE,
        }),
      );
      prisma.turboProjectItem.findFirst.mockResolvedValue(
        makeItem({ status: TurboProjectItemStatus.FAILED }),
      );

      await service.retryItem('project-1', 'item-1', scope, 'quote-2');

      expect(ideaGeneration.retry).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'project-1' }),
        expect.objectContaining({ id: 'item-1' }),
        'quote-2',
        scope,
      );
      expect(
        batchWorkflowExecutionService.startBatchExecution,
      ).not.toHaveBeenCalled();
    });

    it('quotes only idea projects', async () => {
      useProject(makeProject());

      await expect(service.quote('project-1', {}, scope)).rejects.toThrow(
        'Only idea projects are quoted',
      );
    });

    it('keeps a project with generation in flight from being deleted', async () => {
      useProject(makeProject({ status: TurboProjectStatus.GENERATING }));
      prisma.turboProjectItem.count.mockResolvedValue(2);

      await expect(service.remove('project-1', scope)).rejects.toThrow(
        'Wait for generation to finish',
      );
      expect(prisma.turboProject.updateMany).not.toHaveBeenCalled();
    });

    it('deletes under the project lock start and retry take', async () => {
      useProject(makeProject());
      prisma.turboProjectItem.count.mockResolvedValue(0);

      await service.remove('project-1', scope);

      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
      const [lockOrder] =
        reconcileService.runExclusive.mock.invocationCallOrder;
      const [countOrder] =
        prisma.turboProjectItem.count.mock.invocationCallOrder;
      expect(lockOrder).toBeLessThan(countOrder);
      expect(prisma.turboProject.updateMany).toHaveBeenCalled();
    });

    it('moves the project revision when its inputs change', async () => {
      useProject(makeProject());
      prisma.ingredient.findMany.mockResolvedValue([
        { category: IngredientCategory.IMAGE, id: 'input-9' },
      ]);

      await service.addItems(
        'project-1',
        { inputs: [{ ingredientId: 'input-9' }] },
        scope,
      );

      expect(prisma.turboProject.updateMany).toHaveBeenCalledWith({
        data: { revision: { increment: 1 }, updatedAt: expect.any(Date) },
        where: expect.objectContaining({ id: 'project-1' }),
      });
    });

    it('blocks idea generation when the turbo_ideas platform flag is off', async () => {
      useProject(makeProject({ kind: TurboProjectKind.IDEAS }));
      platformSettingsService.getFeatureSettings.mockResolvedValue({
        flags: { turbo_ideas: false },
      });

      await expect(
        service.generateIdeas(
          'project-1',
          { count: 3, formats: ['image'] } as never,
          scope,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.turboProject.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('review', () => {
    it('records the decision in the review inbox and mirrors it back', async () => {
      useProject(makeProject({ status: TurboProjectStatus.REVIEWING }));
      prisma.turboProjectItem.findMany.mockResolvedValue([
        makeItem({
          reviewTurboRunId: 'review-run-1',
          reviewItemId: 'review-item-1',
          status: TurboProjectItemStatus.READY,
        }),
      ]);

      await service.review(
        'project-1',
        { decision: 'approved', itemIds: ['item-1'] },
        scope,
      );

      expect(turboRunService.approveItems).toHaveBeenCalledWith(
        'review-run-1',
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
      useProject(makeProject({ status: TurboProjectStatus.REVIEWING }));
      prisma.turboProjectItem.findMany.mockResolvedValue([
        makeItem({
          reviewTurboRunId: 'review-run-1',
          reviewItemId: 'review-item-1',
          status: TurboProjectItemStatus.REJECTED,
        }),
      ]);

      await expect(
        service.review(
          'project-1',
          { decision: 'approved', itemIds: ['item-1'] },
          scope,
        ),
      ).rejects.toThrow(ConflictException);
      expect(turboRunService.approveItems).not.toHaveBeenCalled();
    });

    it('reads the inbox decision before approving, under the project lock', async () => {
      useProject(makeProject({ status: TurboProjectStatus.REVIEWING }));
      const reviewed = {
        reviewTurboRunId: 'review-run-1',
        reviewItemId: 'review-item-1',
      };
      // Turbo still shows the item READY; the inbox has already rejected it.
      prisma.turboProjectItem.findMany.mockResolvedValue([
        makeItem({ ...reviewed, status: TurboProjectItemStatus.READY }),
      ]);
      reconcileService.syncReviewDecisions.mockImplementation(async () => {
        prisma.turboProjectItem.findMany.mockResolvedValue([
          makeItem({ ...reviewed, status: TurboProjectItemStatus.REJECTED }),
        ]);
      });

      await expect(
        service.review(
          'project-1',
          { decision: 'approved', itemIds: ['item-1'] },
          scope,
        ),
      ).rejects.toThrow(ConflictException);
      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
      expect(turboRunService.approveItems).not.toHaveBeenCalled();
    });

    it('rejects through the review inbox', async () => {
      useProject(makeProject({ status: TurboProjectStatus.REVIEWING }));
      prisma.turboProjectItem.findMany.mockResolvedValue([
        makeItem({
          reviewTurboRunId: 'review-run-1',
          reviewItemId: 'review-item-1',
          status: TurboProjectItemStatus.APPROVED,
        }),
      ]);

      await service.review(
        'project-1',
        { decision: 'rejected', itemIds: ['item-1'] },
        scope,
      );

      expect(turboRunService.rejectItems).toHaveBeenCalledWith(
        'review-run-1',
        ['review-item-1'],
        'org-1',
        undefined,
        'user-1',
      );
    });
  });
});
