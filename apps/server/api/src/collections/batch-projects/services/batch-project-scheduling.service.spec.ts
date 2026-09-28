import { BatchProjectSchedulingService } from '@api/collections/batch-projects/services/batch-project-scheduling.service';
import {
  BatchProjectItemStatus,
  BatchProjectKind,
  BatchProjectStatus,
  BatchProjectStep,
  IngredientCategory,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';

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

describe('BatchProjectSchedulingService', () => {
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
    batchItem: { findMany: vi.fn() },
    post: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  };
  const reviewPost = {
    credentialId: null,
    description: 'Stored caption',
    id: 'review-post-1',
    ingredients: [{ id: 'output-1' }],
    targetExecutionState: TargetExecutionState.DRAFT,
  };
  /** The review draft for caption/approval reads; nothing else scheduled. */
  function postsReading(
    overrides: { reviewPosts?: Row[]; scheduledPosts?: Row[] } = {},
  ) {
    return async (args: { select?: Record<string, unknown> }) =>
      args.select?.description
        ? (overrides.reviewPosts ?? [reviewPost])
        : (overrides.scheduledPosts ?? []);
  }
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
  const postsService = { batchSchedule: vi.fn(), create: vi.fn() };
  const batchGenerationService = { linkDestinationPosts: vi.fn() };
  const service = new BatchProjectSchedulingService(
    prisma as never,
    logger as never,
    reconcileService as never,
    postsService as never,
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
    prisma.post.findMany.mockImplementation(postsReading());
    prisma.post.updateMany.mockResolvedValue({ count: 1 });
    prisma.batchItem.findMany.mockResolvedValue([
      { id: 'review-item-1', reviewDecision: 'APPROVED', status: 'COMPLETED' },
    ]);
  });

  describe('schedule', () => {
    const approvedItem = makeItem({
      caption: 'Stored caption',
      outputCategory: IngredientCategory.VIDEO,
      outputIngredientId: 'output-1',
      postId: 'review-post-1',
      reviewBatchId: 'review-batch-1',
      reviewItemId: 'review-item-1',
      status: BatchProjectItemStatus.APPROVED,
    });

    beforeEach(() => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }), [
        approvedItem,
      ]);
      prisma.credential.findMany.mockResolvedValue([
        { id: 'credential-tiktok', platform: 'TIKTOK' },
        { id: 'credential-instagram', platform: 'INSTAGRAM' },
      ]);
      postsService.create.mockResolvedValue({ id: 'clone-post-1' });
      postsService.batchSchedule.mockImplementation(async (items) => ({
        invalidTargetPostIds: [],
        missingPostIds: [],
        posts: items.map((item: { postId: string }) => ({ id: item.postId })),
      }));
    });

    it('schedules each destination through the shared path with its own time', async () => {
      const result = await service.schedule(
        'project-1',
        {
          captions: { 'item-1': 'Edited caption' },
          targets: [
            {
              credentialId: 'credential-tiktok',
              platform: 'tiktok',
              scheduledDate: '2026-10-01T09:00:00.000Z',
            },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      expect(result).toEqual({ failedCount: 0, scheduledCount: 2 });
      expect(prisma.credential.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-1',
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
      expect(postsService.batchSchedule).toHaveBeenNthCalledWith(
        1,
        [
          {
            ingredientIds: ['output-1'],
            postId: 'review-post-1',
            scheduledDate: '2026-10-01T09:00:00.000Z',
            text: 'Edited caption',
          },
        ],
        'org-1',
        { credentialId: 'credential-tiktok', platform: 'tiktok' },
        'user-1',
      );
      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: 'brand-1',
          category: PostCategory.VIDEO,
          ingredients: ['output-1'],
          sourceActionId: 'batch-project-item:item-1',
          targetExecutionState: TargetExecutionState.DRAFT,
        }),
      );
      const [secondItems] = postsService.batchSchedule.mock.calls[1];
      expect(secondItems[0].postId).toBe('clone-post-1');
      expect(Date.parse(secondItems[0].scheduledDate)).not.toBeNaN();
      expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
        data: {
          scheduledAt: expect.any(Date),
          scheduledTargets: [
            expect.objectContaining({
              credentialId: 'credential-tiktok',
              postId: 'review-post-1',
              status: 'scheduled',
            }),
            expect.objectContaining({
              credentialId: 'credential-instagram',
              postId: 'clone-post-1',
              status: 'scheduled',
            }),
          ],
        },
        where: expect.objectContaining({ id: 'item-1' }),
      });
    });

    it('schedules the media the review draft carries now, on every destination', async () => {
      prisma.post.findMany.mockImplementation(
        postsReading({
          reviewPosts: [{ ...reviewPost, ingredients: [{ id: 'swapped-1' }] }],
        }),
      );

      await service.schedule(
        'project-1',
        {
          targets: [
            { credentialId: 'credential-tiktok', platform: 'tiktok' },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      const [firstItems] = postsService.batchSchedule.mock.calls[0];
      expect(firstItems[0]).toEqual(
        expect.objectContaining({
          ingredientIds: ['swapped-1'],
          postId: 'review-post-1',
        }),
      );
      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ ingredients: ['swapped-1'] }),
      );
      const [secondItems] = postsService.batchSchedule.mock.calls[1];
      expect(secondItems[0].ingredientIds).toEqual(['swapped-1']);
    });

    it('never retargets a review draft already scheduled outside the project', async () => {
      prisma.post.findMany.mockImplementation(
        postsReading({
          reviewPosts: [
            {
              ...reviewPost,
              credentialId: 'credential-elsewhere',
              targetExecutionState: TargetExecutionState.SCHEDULED,
            },
          ],
        }),
      );

      await service.schedule(
        'project-1',
        {
          targets: [{ credentialId: 'credential-tiktok', platform: 'tiktok' }],
        },
        scope,
      );

      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetIdempotencyKey: 'batch-project-item:item-1:credential-tiktok',
        }),
      );
      const [items] = postsService.batchSchedule.mock.calls[0];
      expect(items.map((item: { postId: string }) => item.postId)).toEqual([
        'clone-post-1',
      ]);
    });

    it('schedules under the project lock', async () => {
      await service.schedule(
        'project-1',
        {
          targets: [{ credentialId: 'credential-tiktok', platform: 'tiktok' }],
        },
        scope,
      );

      expect(reconcileService.runExclusive).toHaveBeenCalledWith(
        'project-1',
        expect.any(Function),
      );
    });

    it('keys every extra destination draft by item and account and reuses it', async () => {
      prisma.post.findFirst.mockResolvedValue({
        id: 'existing-clone',
        isDeleted: false,
      });

      await service.schedule(
        'project-1',
        {
          targets: [
            { credentialId: 'credential-tiktok', platform: 'tiktok' },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      expect(prisma.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            targetIdempotencyKey:
              'batch-project-item:item-1:credential-instagram',
          }),
        }),
      );
      expect(postsService.create).not.toHaveBeenCalled();
      const [secondItems] = postsService.batchSchedule.mock.calls[1];
      expect(secondItems[0].postId).toBe('existing-clone');
    });

    it('creates a missing destination draft under its item/account key', async () => {
      await service.schedule(
        'project-1',
        {
          targets: [
            { credentialId: 'credential-tiktok', platform: 'tiktok' },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      expect(postsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetIdempotencyKey:
            'batch-project-item:item-1:credential-instagram',
        }),
      );
    });

    it('records every destination draft on its review item before scheduling it', async () => {
      await service.schedule(
        'project-1',
        {
          targets: [
            { credentialId: 'credential-tiktok', platform: 'tiktok' },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      expect(batchGenerationService.linkDestinationPosts).toHaveBeenCalledTimes(
        1,
      );
      expect(batchGenerationService.linkDestinationPosts).toHaveBeenCalledWith(
        'review-batch-1',
        'review-item-1',
        ['clone-post-1'],
        'org-1',
      );
      expect(
        batchGenerationService.linkDestinationPosts.mock.invocationCallOrder[0],
      ).toBeLessThan(postsService.batchSchedule.mock.invocationCallOrder[1]);
    });

    it('schedules again a destination whose post a review decision pulled back', async () => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }), [
        {
          ...approvedItem,
          scheduledAt: new Date('2026-09-28T11:00:00Z'),
          scheduledTargets: [
            {
              credentialId: 'credential-tiktok',
              postId: 'review-post-1',
              scheduledAt: '2026-09-28T11:00:00.000Z',
              status: 'scheduled',
            },
          ],
        },
      ]);

      const result = await service.schedule(
        'project-1',
        {
          targets: [{ credentialId: 'credential-tiktok', platform: 'tiktok' }],
        },
        scope,
      );

      expect(result).toEqual({ failedCount: 0, scheduledCount: 1 });
      expect(postsService.batchSchedule).toHaveBeenCalledWith(
        [expect.objectContaining({ postId: 'review-post-1' })],
        'org-1',
        { credentialId: 'credential-tiktok', platform: 'tiktok' },
        'user-1',
      );
    });

    it('retries only the destinations that have not scheduled yet', async () => {
      useProject(makeProject({ status: BatchProjectStatus.PARTIAL_FAILURE }), [
        {
          ...approvedItem,
          scheduledAt: new Date('2026-09-28T11:00:00Z'),
          scheduledTargets: [
            {
              credentialId: 'credential-tiktok',
              postId: 'review-post-1',
              scheduledAt: '2026-09-28T11:00:00.000Z',
              status: 'scheduled',
            },
          ],
        },
      ]);
      prisma.post.findMany.mockImplementation(
        postsReading({
          scheduledPosts: [
            {
              credentialId: 'credential-tiktok',
              id: 'review-post-1',
              publishApprovalId: 'approval-1',
              targetExecutionState: TargetExecutionState.SCHEDULED,
            },
          ],
        }),
      );

      const result = await service.schedule(
        'project-1',
        {
          targets: [
            { credentialId: 'credential-tiktok', platform: 'tiktok' },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      expect(result).toEqual({ failedCount: 0, scheduledCount: 1 });
      expect(postsService.batchSchedule).toHaveBeenCalledTimes(1);
      expect(postsService.batchSchedule).toHaveBeenCalledWith(
        [expect.objectContaining({ postId: 'clone-post-1' })],
        'org-1',
        { credentialId: 'credential-instagram', platform: 'instagram' },
        'user-1',
      );
    });

    it('keeps the caption the review inbox approved when there is no override', async () => {
      prisma.post.findMany.mockImplementation(
        postsReading({
          reviewPosts: [
            { ...reviewPost, description: 'Rewritten in the inbox' },
          ],
        }),
      );

      await service.schedule(
        'project-1',
        {
          targets: [
            {
              credentialId: 'credential-tiktok',
              platform: 'tiktok',
              scheduledDate: '2026-10-01T09:00:00.000Z',
            },
          ],
        },
        scope,
      );

      expect(postsService.batchSchedule).toHaveBeenCalledWith(
        [expect.objectContaining({ text: 'Rewritten in the inbox' })],
        'org-1',
        expect.anything(),
        'user-1',
      );
    });

    it('binds each post to its destination before scheduling and keeps partial successes', async () => {
      postsService.batchSchedule.mockRejectedValueOnce(
        new Error('Media readiness failed for one approval'),
      );
      prisma.post.findMany.mockImplementation(
        async (args: { select?: Record<string, unknown> }) => {
          if (args.select?.description) {
            return [reviewPost];
          }
          // Nothing had gone out before the call; the call then half-commits.
          return postsService.batchSchedule.mock.calls.length === 0
            ? []
            : [
                {
                  credentialId: 'credential-tiktok',
                  id: 'review-post-1',
                  publishApprovalId: 'approval-1',
                  targetExecutionState: TargetExecutionState.SCHEDULED,
                },
              ];
        },
      );

      const result = await service.schedule(
        'project-1',
        {
          targets: [
            { credentialId: 'credential-tiktok', platform: 'tiktok' },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      const bindingWrite = prisma.batchProjectItem.updateMany.mock.calls.find(
        ([args]) =>
          Array.isArray(args.data.scheduledTargets) &&
          args.data.scheduledTargets.some(
            (entry: { status: string }) => entry.status === 'pending',
          ),
      );
      expect(bindingWrite).toBeDefined();
      expect(
        prisma.batchProjectItem.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(postsService.batchSchedule.mock.invocationCallOrder[0]);
      expect(result).toEqual({ failedCount: 0, scheduledCount: 2 });
      const [secondItems] = postsService.batchSchedule.mock.calls[1];
      expect(secondItems[0].postId).toBe('clone-post-1');
    });

    it('reuses the post bound to a destination whose first attempt failed', async () => {
      useProject(makeProject({ status: BatchProjectStatus.PARTIAL_FAILURE }), [
        {
          ...approvedItem,
          scheduledTargets: [
            {
              credentialId: 'credential-instagram',
              postId: 'review-post-1',
              status: 'failed',
            },
          ],
        },
      ]);

      await service.schedule(
        'project-1',
        {
          targets: [
            { credentialId: 'credential-tiktok', platform: 'tiktok' },
            { credentialId: 'credential-instagram', platform: 'instagram' },
          ],
        },
        scope,
      );

      const calls = postsService.batchSchedule.mock.calls.map(
        ([items, , target]) => [items[0].postId, target.credentialId],
      );
      expect(calls).toEqual([
        ['clone-post-1', 'credential-tiktok'],
        ['review-post-1', 'credential-instagram'],
      ]);
    });

    it('refuses an item the review inbox rejected after Batch approved it', async () => {
      prisma.batchItem.findMany.mockResolvedValue([
        { id: 'review-item-1', reviewDecision: 'REJECTED', status: 'SKIPPED' },
      ]);

      await expect(
        service.schedule(
          'project-1',
          {
            targets: [
              { credentialId: 'credential-tiktok', platform: 'tiktok' },
              { credentialId: 'credential-instagram', platform: 'instagram' },
            ],
          },
          scope,
        ),
      ).rejects.toThrow('Approve at least one item before scheduling');
      expect(prisma.batchItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['review-item-1'] },
            isDeleted: false,
            organizationId: 'org-1',
          }),
        }),
      );
      expect(postsService.create).not.toHaveBeenCalled();
      expect(postsService.batchSchedule).not.toHaveBeenCalled();
    });

    it('refuses an item whose review draft is gone', async () => {
      prisma.post.findMany.mockImplementation(
        postsReading({ reviewPosts: [] }),
      );

      await expect(
        service.schedule(
          'project-1',
          {
            targets: [
              { credentialId: 'credential-tiktok', platform: 'tiktok' },
              { credentialId: 'credential-instagram', platform: 'instagram' },
            ],
          },
          scope,
        ),
      ).rejects.toThrow('Approve at least one item before scheduling');
      expect(postsService.create).not.toHaveBeenCalled();
      expect(postsService.batchSchedule).not.toHaveBeenCalled();
    });

    it('does not schedule again a destination whose bound post already went out', async () => {
      useProject(makeProject({ status: BatchProjectStatus.REVIEWING }), [
        {
          ...approvedItem,
          scheduledTargets: [
            {
              credentialId: 'credential-tiktok',
              postId: 'review-post-1',
              status: 'pending',
            },
          ],
        },
      ]);
      prisma.post.findMany.mockImplementation(
        postsReading({
          scheduledPosts: [
            {
              credentialId: 'credential-tiktok',
              id: 'review-post-1',
              publishApprovalId: 'approval-1',
              targetExecutionState: TargetExecutionState.PUBLISHED,
            },
          ],
        }),
      );

      const result = await service.schedule(
        'project-1',
        {
          targets: [{ credentialId: 'credential-tiktok', platform: 'tiktok' }],
        },
        scope,
      );

      expect(postsService.batchSchedule).not.toHaveBeenCalled();
      expect(result).toEqual({ failedCount: 0, scheduledCount: 1 });
      expect(prisma.batchProjectItem.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scheduledTargets: [
            expect.objectContaining({
              credentialId: 'credential-tiktok',
              postId: 'review-post-1',
              status: 'scheduled',
            }),
          ],
        }),
        where: expect.objectContaining({ id: 'item-1' }),
      });
    });

    it('counts a destination the channel rejects as failed', async () => {
      postsService.batchSchedule.mockResolvedValue({
        invalidTargetPostIds: ['review-post-1'],
        missingPostIds: [],
        posts: [],
      });

      const result = await service.schedule(
        'project-1',
        {
          targets: [{ credentialId: 'credential-tiktok', platform: 'tiktok' }],
        },
        scope,
      );

      expect(result).toEqual({ failedCount: 1, scheduledCount: 0 });
      expect(prisma.batchProjectItem.updateMany).toHaveBeenLastCalledWith({
        data: {
          scheduledAt: null,
          scheduledTargets: [
            {
              credentialId: 'credential-tiktok',
              postId: 'review-post-1',
              status: 'failed',
            },
          ],
        },
        where: expect.objectContaining({ id: 'item-1' }),
      });
    });

    it('rejects an account that is not connected to the brand', async () => {
      prisma.credential.findMany.mockResolvedValue([]);

      await expect(
        service.schedule(
          'project-1',
          {
            targets: [{ credentialId: 'credential-other', platform: 'tiktok' }],
          },
          scope,
        ),
      ).rejects.toThrow('not connected to this brand');
      expect(postsService.batchSchedule).not.toHaveBeenCalled();
    });
  });
});
