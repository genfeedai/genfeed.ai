import {
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { PostLifecycleService } from '@api/index';
import type {
  SchedulerPostTarget,
  SchedulerTx,
} from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import type { PostGroupPersistenceService } from '@api/collections/post-groups/services/post-group-persistence.service';
import type { PostGroupReadinessService } from '@api/collections/post-groups/services/post-group-readiness.service';
import {
  applyReleaseTargetUpdates,
  GROUP_ACTION_STATES,
  type PostGroupTargetOperationDependencies,
} from '@api/collections/post-groups/services/post-group-target.operations';
import type { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import type { PublishApprovalsService } from '@api/collections/publish-approvals/services/publish-approvals.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

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
      enqueueReleaseTargets: vi.fn(),
      persistenceService: {} as PostGroupPersistenceService,
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

    expect(transition).not.toHaveBeenCalled();
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
    expect(transaction).not.toHaveBeenCalled();
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

function makeTarget(
  overrides: Pick<SchedulerPostTarget, 'id' | 'targetExecutionState'>,
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
