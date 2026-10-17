import type {
  SchedulerPostGroup,
  SchedulerPostTarget,
  SchedulerTx,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import type { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import {
  applyReleaseTargetUpdates,
  GROUP_ACTION_STATES,
  type PostGroupTargetOperationDependencies,
  schedulePostGroupTarget,
  updatePostGroupTarget,
} from '@api/collections/post-groups/services/post-group-target.operations';
import { replacePostIngredientLinks } from '@api/collections/posts/services/post-ingredient-links.util';
import type { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { PostLifecycleService } from '@api/index';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { type Mock, vi } from 'vitest';

describe('applyReleaseTargetUpdates', () => {
  const contractService = new PostGroupContractService();
  let transition: ReturnType<typeof vi.fn>;
  let updateMany: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;
  let tx: SchedulerTx;
  let dependencies: PostGroupTargetOperationDependencies;

  beforeEach(() => {
    transition = vi.fn().mockResolvedValue({ kind: 'ok' });
    updateMany = vi.fn().mockResolvedValue({ count: 1 });
    transaction = vi.fn();
    tx = { post: { updateMany } } as unknown as SchedulerTx;
    dependencies = {
      contractService,
      ensureReleaseForPost: vi.fn(),
      enqueueReleaseTargets: vi.fn(),
      persistenceService: new PostGroupPersistenceService(
        {} as PrismaService,
        contractService,
        {} as PostGroupReadinessService,
      ),
      postLifecycleService: { transition } as unknown as PostLifecycleService,
      prisma: { $transaction: transaction } as unknown as PrismaService,
      publishApprovalsService: {} as PublishApprovalsService,
      readinessService: {} as PostGroupReadinessService,
      scheduledPostWorkflowQueue: {} as ScheduledPostWorkflowQueueService,
    };
  });

  it('exports the actionable target states the remaining service call sites share', () => {
    expect([...GROUP_ACTION_STATES]).toEqual([
      TargetExecutionState.DRAFT,
      TargetExecutionState.SCHEDULED,
      TargetExecutionState.PAUSED,
      TargetExecutionState.FAILED,
    ]);
  });

  it('transitions only actionable targets when the release status changes', async () => {
    await applyReleaseTargetUpdates(
      tx,
      {
        currentTargets: [
          makeTarget({
            id: 'target-scheduled',
            targetExecutionState: TargetExecutionState.SCHEDULED,
          }),
          makeTarget({
            id: 'target-published',
            targetExecutionState: TargetExecutionState.PUBLISHED,
          }),
        ],
        groupId: 'group-1',
        input: { status: ReleaseStatus.PAUSED },
        organizationId: 'org-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      {
        actorId: 'user-1',
        groupId: 'group-1',
        mutation: {},
        nextState: TargetExecutionState.PAUSED,
        organizationId: 'org-1',
        postId: 'target-scheduled',
        reason: 'Release lifecycle updated',
      },
      tx,
    );
    expect(updateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('applies a single scoped updateMany when target fields change without a status', async () => {
    await applyReleaseTargetUpdates(
      tx,
      {
        currentTargets: [
          makeTarget({
            id: 'target-scheduled',
            targetExecutionState: TargetExecutionState.SCHEDULED,
          }),
        ],
        groupId: 'group-1',
        input: {
          baseContent: 'Updated caption',
          scheduledDate: '2026-07-09T12:00:00.000Z',
          timezone: 'Europe/Malta',
        },
        organizationId: 'org-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        description: 'Updated caption',
        scheduledDate: new Date('2026-07-09T12:00:00.000Z'),
        timezone: 'Europe/Malta',
      },
      where: {
        groupId: 'group-1',
        isDeleted: false,
        organizationId: 'org-1',
        targetExecutionState: {
          in: [
            TargetExecutionState.DRAFT,
            TargetExecutionState.SCHEDULED,
            TargetExecutionState.PAUSED,
            TargetExecutionState.FAILED,
          ],
        },
      },
    });
    // The caption changed and this target is already SCHEDULED (#5193):
    // `applyReleaseTargetUpdates` doesn't route a non-status update through
    // `PostLifecycleService` for the write itself, so it re-validates the
    // target directly afterward instead of leaving it SCHEDULED unchecked.
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition).toHaveBeenCalledWith(
      {
        actorId: 'user-1',
        groupId: 'group-1',
        mutation: {
          description: 'Updated caption',
          scheduledDate: new Date('2026-07-09T12:00:00.000Z'),
          timezone: 'Europe/Malta',
        },
        nextState: TargetExecutionState.SCHEDULED,
        organizationId: 'org-1',
        postId: 'target-scheduled',
        reason: 'Release lifecycle updated',
      },
      tx,
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('resyncs each target ingredients relation when the release media changes', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'target-scheduled' });
    const findMany = vi
      .fn()
      .mockResolvedValue([
        { category: IngredientCategory.IMAGE },
        { category: IngredientCategory.IMAGE },
      ]);
    tx = {
      ingredient: { findMany },
      post: { update, updateMany },
    } as unknown as SchedulerTx;

    await applyReleaseTargetUpdates(
      tx,
      {
        currentTargets: [
          makeTarget({
            id: 'target-scheduled',
            targetExecutionState: TargetExecutionState.SCHEDULED,
          }),
        ],
        groupId: 'group-1',
        input: {
          media: [{ assetId: 'asset-1' }, { assetId: 'asset-2' }],
        },
        organizationId: 'org-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(update).toHaveBeenCalledWith({
      data: {
        category: PostCategory.IMAGE,
        ingredientLinks: replacePostIngredientLinks('org-1', [
          'asset-1',
          'asset-2',
        ]),
      },
      where: expect.objectContaining({ id: 'target-scheduled' }),
    });
    expect(findMany).toHaveBeenCalledWith({
      select: { category: true },
      where: {
        id: { in: ['asset-1', 'asset-2'] },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(transition).toHaveBeenCalledTimes(1);
    expect(transition.mock.calls[0]?.[0]).toMatchObject({
      nextState: TargetExecutionState.SCHEDULED,
      postId: 'target-scheduled',
    });
  });

  it('resets a target to TEXT in the same write that removes all of its media', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'target-scheduled' });
    const findMany = vi.fn();
    tx = {
      ingredient: { findMany },
      post: { update, updateMany },
    } as unknown as SchedulerTx;

    await applyReleaseTargetUpdates(
      tx,
      {
        currentTargets: [
          makeTarget({
            category: PostCategory.IMAGE,
            id: 'target-scheduled',
            targetExecutionState: TargetExecutionState.SCHEDULED,
          }),
        ],
        groupId: 'group-1',
        input: { media: [] },
        organizationId: 'org-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(findMany).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      data: {
        category: PostCategory.TEXT,
        ingredientLinks: replacePostIngredientLinks('org-1', []),
      },
      where: expect.objectContaining({ id: 'target-scheduled' }),
    });
  });

  it('keeps a REEL target a REEL when its replacement media is still a video', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'target-reel' });
    tx = {
      ingredient: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ category: IngredientCategory.VIDEO }]),
      },
      post: { update, updateMany },
    } as unknown as SchedulerTx;

    await applyReleaseTargetUpdates(
      tx,
      {
        currentTargets: [
          makeTarget({
            category: PostCategory.REEL,
            id: 'target-reel',
            targetExecutionState: TargetExecutionState.DRAFT,
          }),
        ],
        groupId: 'group-1',
        input: { media: [{ assetId: 'video-2' }] },
        organizationId: 'org-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(update).toHaveBeenCalledWith({
      data: {
        category: PostCategory.REEL,
        ingredientLinks: replacePostIngredientLinks('org-1', ['video-2']),
      },
      where: expect.objectContaining({ id: 'target-reel' }),
    });
  });

  it('writes nothing when neither status nor target fields change', async () => {
    await applyReleaseTargetUpdates(
      tx,
      {
        currentTargets: [
          makeTarget({
            id: 'target-scheduled',
            targetExecutionState: TargetExecutionState.SCHEDULED,
          }),
        ],
        groupId: 'group-1',
        input: { title: 'New title' },
        organizationId: 'org-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(transition).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('schedulePostGroupTarget legacy group ids', () => {
  const contractService = new PostGroupContractService();
  const releaseId = 'release-created';
  let ensureReleaseForPost: Mock<
    PostGroupTargetOperationDependencies['ensureReleaseForPost']
  >;
  let enqueueReleaseTargets: Mock<
    PostGroupTargetOperationDependencies['enqueueReleaseTargets']
  >;
  let findGroup: ReturnType<typeof vi.fn>;
  let getGroupOrThrow: ReturnType<typeof vi.fn>;
  let getTargetOrThrow: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;
  let dependencies: PostGroupTargetOperationDependencies;
  let tx: SchedulerTx;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-08T22:25:13.000Z'));
    ensureReleaseForPost = vi
      .fn<PostGroupTargetOperationDependencies['ensureReleaseForPost']>()
      .mockResolvedValue(makeRelease(releaseId));
    enqueueReleaseTargets = vi
      .fn<PostGroupTargetOperationDependencies['enqueueReleaseTargets']>()
      .mockResolvedValue(undefined);
    findGroup = vi.fn().mockResolvedValue(null);
    getGroupOrThrow = vi.fn().mockResolvedValue(makeGroup(releaseId));
    getTargetOrThrow = vi.fn().mockResolvedValue(
      makeTarget({
        id: 'target-1',
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    );
    transaction = vi.fn(async (fn: (client: SchedulerTx) => unknown) => fn(tx));
    tx = {} as SchedulerTx;
    dependencies = {
      contractService,
      ensureReleaseForPost,
      enqueueReleaseTargets,
      persistenceService: {
        getGroupOrThrow,
        getTargetOrThrow,
        hydrateWithDerivedStatus: vi
          .fn()
          .mockResolvedValue(makeRelease(releaseId)),
        resolveBrandId: vi.fn().mockResolvedValue('brand-1'),
        resolveCredentials: vi.fn().mockResolvedValue(
          new Map([
            [
              'cred-x',
              {
                brandId: 'brand-1',
                id: 'cred-x',
                isConnected: true,
                organizationId: 'org-1',
                platform: CredentialPlatform.TWITTER,
              },
            ],
          ]),
        ),
      } as unknown as PostGroupPersistenceService,
      postLifecycleService: {
        transition: vi.fn().mockResolvedValue({ kind: 'ok' }),
      } as unknown as PostLifecycleService,
      prisma: {
        $transaction: transaction,
        postGroup: { findFirst: findGroup },
      } as unknown as PrismaService,
      publishApprovalsService: {
        createForCurrentPost: vi.fn().mockResolvedValue({ id: 'approval-1' }),
      } as unknown as PublishApprovalsService,
      readinessService: {
        assertSchedulable: vi.fn(),
        resolveForCredentials: vi.fn().mockResolvedValue(new Map()),
      } as unknown as PostGroupReadinessService,
      scheduledPostWorkflowQueue: {} as ScheduledPostWorkflowQueueService,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves a legacy id before scheduling and enqueues that release', async () => {
    await schedulePostGroupTarget(
      {
        groupId: 'legacy-batch',
        organizationId: 'org-1',
        scheduledDate: new Date('2026-07-08T22:25:13.000Z'),
        targetId: 'target-1',
        userId: 'user-1',
        workflowSource: 'publish_now',
      },
      dependencies,
    );
    await schedulePostGroupTarget(
      {
        groupId: 'legacy-batch',
        organizationId: 'org-1',
        scheduledDate: new Date('2026-07-08T22:25:13.000Z'),
        targetId: 'target-1',
        userId: 'user-1',
        workflowSource: 'publish_now',
      },
      dependencies,
    );

    expect(findGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'legacy-batch',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
    expect(ensureReleaseForPost).toHaveBeenCalledTimes(2);
    expect(ensureReleaseForPost).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'target-1',
    );
    expect(ensureReleaseForPost.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.mock.invocationCallOrder[0] ?? 0,
    );
    expect(getGroupOrThrow).toHaveBeenCalledWith(tx, 'org-1', releaseId);
    expect(enqueueReleaseTargets).toHaveBeenCalledWith(
      expect.objectContaining({ id: releaseId }),
      'user-1',
      ['target-1'],
      'publish_now',
    );
  });

  it('does not resolve a target in another organization', async () => {
    ensureReleaseForPost.mockRejectedValue(
      new NotFoundException('Post', 'target-1'),
    );

    await expect(
      schedulePostGroupTarget(
        {
          groupId: 'legacy-batch',
          organizationId: 'org-2',
          scheduledDate: new Date('2026-07-08T22:25:13.000Z'),
          targetId: 'target-1',
          userId: 'user-1',
          workflowSource: 'publish_now',
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId: 'org-2',
        }),
      }),
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(enqueueReleaseTargets).not.toHaveBeenCalled();
  });

  it('404s a real release that does not contain the target', async () => {
    findGroup.mockResolvedValue({ id: 'group-other' });
    getGroupOrThrow.mockResolvedValue(makeGroup('group-other'));
    getTargetOrThrow.mockRejectedValue(
      new NotFoundException('ChannelTarget', 'target-missing'),
    );

    await expect(
      schedulePostGroupTarget(
        {
          groupId: 'group-other',
          organizationId: 'org-1',
          scheduledDate: new Date('2026-07-09T12:00:00.000Z'),
          targetId: 'target-missing',
          userId: 'user-1',
          workflowSource: 'publish_now',
        },
        dependencies,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(ensureReleaseForPost).not.toHaveBeenCalled();
    expect(enqueueReleaseTargets).not.toHaveBeenCalled();
  });
});

describe('updatePostGroupTarget approval invalidation', () => {
  const contractService = new PostGroupContractService();
  const releaseId = 'release-1';
  let invalidatePost: ReturnType<typeof vi.fn>;
  let updateMany: ReturnType<typeof vi.fn>;
  let dependencies: PostGroupTargetOperationDependencies;

  beforeEach(() => {
    invalidatePost = vi.fn().mockResolvedValue(undefined);
    updateMany = vi.fn().mockResolvedValue({ count: 1 });
    // Channel content validation is covered by the contract service spec; this
    // suite only asserts which fields invalidate the approval.
    vi.spyOn(contractService, 'validateTargetUpdate').mockReturnValue(
      undefined,
    );
    const tx = { post: { updateMany } } as unknown as SchedulerTx;
    dependencies = {
      contractService,
      ensureReleaseForPost: vi.fn(),
      enqueueReleaseTargets: vi.fn(),
      persistenceService: {
        getGroupOrThrow: vi.fn().mockResolvedValue(makeGroup(releaseId)),
        getTargetOrThrow: vi.fn().mockResolvedValue({
          ...makeTarget({
            id: 'target-1',
            targetExecutionState: TargetExecutionState.SCHEDULED,
          }),
          platform: CredentialPlatform.YOUTUBE,
        }),
        hydrateWithDerivedStatus: vi
          .fn()
          .mockResolvedValue(makeRelease(releaseId)),
      } as unknown as PostGroupPersistenceService,
      postLifecycleService: {} as PostLifecycleService,
      prisma: {
        $transaction: vi.fn(async (fn: (client: SchedulerTx) => unknown) =>
          fn(tx),
        ),
        postGroup: { findFirst: vi.fn().mockResolvedValue({ id: releaseId }) },
      } as unknown as PrismaService,
      publishApprovalsService: {
        invalidatePost,
      } as unknown as PublishApprovalsService,
      readinessService: {} as PostGroupReadinessService,
      scheduledPostWorkflowQueue: {} as ScheduledPostWorkflowQueueService,
    };
  });

  it('invalidates the approval when only the YouTube audience changes', async () => {
    await updatePostGroupTarget(
      {
        body: { visibility: PostVisibility.PRIVATE },
        groupId: releaseId,
        organizationId: 'org-1',
        targetId: 'target-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(invalidatePost).toHaveBeenCalledWith(
      'org-1',
      'target-1',
      expect.any(String),
      'user-1',
    );
  });

  it('keeps the approval when no protected field changes', async () => {
    await updatePostGroupTarget(
      {
        body: { order: 2 },
        groupId: releaseId,
        organizationId: 'org-1',
        targetId: 'target-1',
        userId: 'user-1',
      },
      dependencies,
    );

    expect(invalidatePost).not.toHaveBeenCalled();
  });
});

function makeTarget(
  overrides: Pick<SchedulerPostTarget, 'id' | 'targetExecutionState'> &
    Partial<Pick<SchedulerPostTarget, 'category'>>,
): SchedulerPostTarget {
  return {
    agentContextSource: null,
    agentContextVersion: null,
    agentStrategyId: null,
    agentThreadId: null,
    analyticsCollectedAt: null,
    analyticsCollectionAttemptKey: null,
    analyticsCollectionError: null,
    analyticsCollectionRequestedAt: null,
    analyticsCollectionState: 'idle',
    brandId: 'brand-1',
    campaignId: null,
    createdAt: new Date('2026-07-08T22:25:13.000Z'),
    credentialId: 'cred-x',
    externalId: null,
    externalShortcode: null,
    groupId: 'group-1',
    isDeleted: false,
    lastAttemptAt: null,
    order: 0,
    platform: 'twitter',
    publishedAt: null,
    publishApprovalId: null,
    retryCount: 0,
    scheduledDate: null,
    status: 'scheduled',
    targetAttachments: [],
    targetError: null,
    targetIdempotencyKey: null,
    targetReadiness: null,
    targetSettings: {},
    targetValidationIssues: [],
    targetValidationState: 'valid',
    timezone: 'UTC',
    updatedAt: new Date('2026-07-08T22:25:13.000Z'),
    url: null,
    visibility: PostVisibility.PUBLIC,
    workflowExecutionId: null,
    ...overrides,
  };
}

function makeGroup(id: string): SchedulerPostGroup {
  return {
    attachments: [],
    baseContent: 'Base content',
    brandId: 'brand-1',
    campaignId: null,
    createdAt: new Date('2026-07-08T22:25:13.000Z'),
    id,
    idempotencyKey: null,
    isDeleted: false,
    media: [],
    organizationId: 'org-1',
    ownerId: 'user-1',
    postingSetId: null,
    publishedAt: null,
    recurrence: null,
    rssFeedItemId: null,
    rssSourceId: null,
    scheduledAt: null,
    status: ReleaseStatus.DRAFT,
    statusTransitions: [],
    timezone: 'UTC',
    title: 'Launch note',
    updatedAt: new Date('2026-07-08T22:25:13.000Z'),
  };
}

function makeRelease(id: string): IReleaseGroup {
  return {
    id,
    organizationId: 'org-1',
    targets: [
      {
        executionState: TargetExecutionState.SCHEDULED,
        id: 'target-1',
      },
    ],
  } as IReleaseGroup;
}
