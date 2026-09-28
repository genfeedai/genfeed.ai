import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import type { BatchItemFull } from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { buildAgentReviewActivity } from '@api/services/notifications/workflow-notifications/workflow-outcome-activity';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentPublishDecision,
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  PersistedReviewDecision,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IBatchSummary } from '@genfeedai/contracts/interfaces';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const reviewActivity = { key: 'agent-review-expired' };
vi.mock(
  '@api/services/notifications/workflow-notifications/workflow-outcome-activity',
  () => ({
    buildAgentReviewActivity: vi.fn(async () => reviewActivity),
  }),
);

function fixture() {
  let item: BatchItemFull = {
    id: 'item-1',
    postId: 'post-1',
    caption: 'Caption',
    format: ContentFormat.IMAGE,
    platform: 'instagram',
    status: BatchItemStatus.COMPLETED,
    reviewDecision: ReviewDecision.UNSET as ReviewDecision,
    scheduledDate: '2026-09-24T15:00:00.000Z',
  };
  let post = {
    id: 'post-1',
    brandId: 'brand-1',
    platform: 'instagram',
    updatedAt: new Date('2026-09-20T00:00:00Z'),
    agentStrategyId: 'strategy-1',
    credentialId: 'credential-1',
    targetExecutionState: TargetExecutionState.DRAFT,
    isDeleted: false,
    reviewDecision: null as string | null,
    createdAt: new Date('2026-09-20T00:00:00Z'),
  };
  const calls: string[] = [];
  let batchUpdatedAt = new Date('2026-09-20T00:00:00Z');
  const batch = () => ({
    id: 'batch-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
    config: {},
    items: [{ ...item }],
    status: BatchStatus.COMPLETED,
    updatedAt: batchUpdatedAt,
  });
  const tx = {
    $queryRaw: vi.fn(async () => {
      calls.push('lock');
      return [{ id: 'batch-1' }];
    }),
    batch: {
      findFirst: vi.fn(async () => {
        calls.push('read');
        return batch();
      }),
      updateMany: vi.fn(async ({ data }) => {
        item = data.items[0];
        return { count: 1 };
      }),
    },
    batchItem: { upsert: vi.fn() },
    agentStrategy: {
      findFirst: vi.fn().mockResolvedValue({
        isActive: true,
        config: {},
        policies: {
          publishPolicy: {
            autoPublishEnabled: true,
            platformStates: {
              instagram: { approvalStreak: 4, autoPublishEnabled: true },
            },
          },
        },
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    brand: { findFirst: vi.fn().mockResolvedValue({ agentConfig: {} }) },
    agentPublishAudit: { create: vi.fn() },
    post: {
      findFirst: vi.fn(async () => (post.isDeleted ? null : { ...post })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  // Transactions queue like the database's batch row lock; concurrent review calls must reload after their predecessor commits.
  let tail = Promise.resolve();
  const prisma = {
    $transaction: <T>(fn: (client: typeof tx) => Promise<T>) => {
      const result = tail.then(() => fn(tx));
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const approvals = {
    createForCurrentPost: vi.fn(async () => ({
      id: 'grant-1',
      artifactVersionPinId: 'pin-1',
    })),
    invalidatePost: vi.fn(
      async (
        _org: string,
        _id: string,
        _reason: string,
        _actor?: string,
        _tx?: unknown,
      ) => {},
    ),
  };
  const lifecycle = {
    transition: vi.fn(async ({ nextState, mutation }, client) => {
      expect(client).toBe(tx);
      post = { ...post, ...mutation, targetExecutionState: nextState };
      return { kind: 'transitioned', target: post };
    }),
  };
  const policy = {
    assessPostMediaReasons: vi.fn().mockResolvedValue([]),
    recordReviewDecision: vi.fn(),
    resolveForPost: vi.fn(async () => ({
      reviewTimeoutHours: 24,
      result: { decision: AgentPublishDecision.DENIED },
    })),
  };
  const activityRecorder = { recordInTransaction: vi.fn() };
  const service = new BatchGenerationReviewService(
    prisma as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[0],
    { log: vi.fn() } as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[1],
    {} as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[2],
    lifecycle as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[3],
    approvals as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[4],
    {
      toBatchSummary: async (row: unknown) => row,
    } as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[5],
    policy as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[6],
    activityRecorder as unknown as ConstructorParameters<
      typeof BatchGenerationReviewService
    >[7],
    {
      assertActive: vi.fn(),
      run: vi.fn(
        async (
          _ids: string[],
          _org: string,
          operation: () => Promise<unknown>,
        ) => operation(),
      ),
    } as never,
  );
  return {
    activityRecorder,
    service,
    updateUnrelatedBatch: () => {
      batchUpdatedAt = new Date('2026-09-27T00:00:00Z');
    },
    tx,
    approvals,
    lifecycle,
    policy,
    calls,
    current: () => ({ item, post }),
  };
}

describe('Autonomous review transaction boundary', () => {
  it('applies rewrites as edits, invalidates approval, and leaves publication in draft', async () => {
    const f = fixture();
    vi.spyOn(f.service, 'getBatch').mockResolvedValue({
      id: 'batch-1',
      items: [],
    } as unknown as IBatchSummary);
    f.current().item.reviewDecision = ReviewDecision.APPROVED;
    f.current().post.reviewDecision = PersistedReviewDecision.APPROVED;
    const realPolicy = new AutonomousPublishPolicyService(
      f.tx as unknown as PrismaService,
      f.activityRecorder as unknown as ConstructorParameters<
        typeof AutonomousPublishPolicyService
      >[1],
    );
    f.policy.recordReviewDecision.mockImplementation((input, transaction) =>
      realPolicy.recordReviewDecision(input, transaction),
    );
    const expectedDate = new Date('2026-09-20T00:00:00Z');
    await f.service.applyRewrites(
      'batch-1',
      'org-1',
      'user-1',
      new Map([['item-1', 'Rewritten caption']]),
      new Map([['post-1', expectedDate]]),
    );
    expect(f.current().item.caption).toBe('Rewritten caption');
    expect(f.current().item.reviewDecision).toBe(ReviewDecision.UNSET);
    expect(f.current().post.reviewDecision).toBeNull();
    expect(f.tx.batchItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ reviewDecision: null }),
      }),
    );
    expect(f.tx.agentStrategy.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          policies: expect.objectContaining({
            publishPolicy: expect.objectContaining({
              platformStates: expect.objectContaining({
                instagram: expect.objectContaining({
                  approvalStreak: 0,
                  autoPublishEnabled: false,
                }),
              }),
            }),
          }),
        }),
      }),
    );
    expect(f.current().item.reviewEvents).toEqual([
      expect.objectContaining({
        decision: ReviewDecision.REQUEST_CHANGES,
        reviewerId: 'user-1',
      }),
    ]);
    expect(f.policy.recordReviewDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        hasRewriteHistory: true,
        decision: ReviewDecision.REQUEST_CHANGES,
      }),
      f.tx,
    );
    expect(f.approvals.invalidatePost).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      'Content rewritten',
      'user-1',
      f.tx,
    );
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.lifecycle.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        nextState: TargetExecutionState.DRAFT,
        mutation: expect.objectContaining({ description: 'Rewritten caption' }),
      }),
      f.tx,
    );
  });

  it('allows unrelated batch updates after the post snapshot', async () => {
    const f = fixture();
    vi.spyOn(f.service, 'getBatch').mockResolvedValue({
      id: 'batch-1',
      items: [],
    } as unknown as IBatchSummary);
    const versions = new Map([['post-1', f.current().post.updatedAt]]);
    f.updateUnrelatedBatch();
    await expect(
      f.service.applyRewrites(
        'batch-1',
        'org-1',
        'user-1',
        new Map([['item-1', 'New']]),
        versions,
      ),
    ).resolves.toMatchObject({ id: 'batch-1' });
    expect(f.current().item.caption).toBe('New');
    expect(f.tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('records the rewrite job on the review event in the apply transaction', async () => {
    const f = fixture();
    vi.spyOn(f.service, 'getBatch').mockResolvedValue({
      id: 'batch-1',
      items: [],
    } as unknown as IBatchSummary);

    await f.service.applyRewrites(
      'batch-1',
      'org-1',
      'user-1',
      new Map([['item-1', 'New']]),
      new Map([['post-1', f.current().post.updatedAt]]),
      'job-1',
    );

    expect(f.current().item.reviewEvents?.at(-1)).toMatchObject({
      feedback: 'Content rewritten',
      rewriteJobId: 'job-1',
    });
    expect(f.tx.batchItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          data: expect.objectContaining({
            reviewEvents: expect.arrayContaining([
              expect.objectContaining({ rewriteJobId: 'job-1' }),
            ]),
          }),
        }),
      }),
    );
  });

  it('rejects a rewrite when rejection skips the item before the apply lock', async () => {
    const f = fixture();
    const versions = new Map([['post-1', f.current().post.updatedAt]]);
    f.current().item.status = BatchItemStatus.SKIPPED;
    f.current().item.reviewDecision = ReviewDecision.REJECTED;
    await expect(
      f.service.applyRewrites(
        'batch-1',
        'org-1',
        'user-1',
        new Map([['item-1', 'New']]),
        versions,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(f.current().item.caption).toBe('Caption');
    expect(f.lifecycle.transition).not.toHaveBeenCalled();
    expect(f.tx.batch.updateMany).not.toHaveBeenCalled();
    expect(f.approvals.invalidatePost).not.toHaveBeenCalled();
  });

  it('allows an intentional rewrite of an approved completed item', async () => {
    const f = fixture();
    f.current().item.reviewDecision = ReviewDecision.APPROVED;
    vi.spyOn(f.service, 'getBatch').mockResolvedValue({
      id: 'batch-1',
      items: [],
    } as unknown as IBatchSummary);
    await f.service.applyRewrites(
      'batch-1',
      'org-1',
      'user-1',
      new Map([['item-1', 'New']]),
      new Map([['post-1', f.current().post.updatedAt]]),
    );
    expect(f.current().item.caption).toBe('New');
    expect(f.current().item.reviewDecision).toBe(ReviewDecision.UNSET);
  });

  it('returns 409 when a selected post changes after the snapshot', async () => {
    const f = fixture();
    const versions = new Map([['post-1', f.current().post.updatedAt]]);
    f.current().post.updatedAt = new Date('2026-09-27T00:00:00Z');
    await expect(
      f.service.applyRewrites(
        'batch-1',
        'org-1',
        'user-1',
        new Map([['item-1', 'New']]),
        versions,
      ),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      status: 409,
    });
    expect(f.lifecycle.transition).not.toHaveBeenCalled();
    expect(f.tx.batch.updateMany).not.toHaveBeenCalled();
    expect(f.approvals.invalidatePost).not.toHaveBeenCalled();
    expect(f.policy.recordReviewDecision).not.toHaveBeenCalled();
  });

  it('expires a pending draft without ever creating a publish grant', async () => {
    const f = fixture();
    expect(
      await f.service.expireAutonomousReviewBatch('batch-1', 'org-1'),
    ).toEqual(['post-1']);
    expect(f.calls.slice(0, 2)).toEqual(['lock', 'read']);
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.approvals.invalidatePost.mock.calls[0]?.[4]).toBe(f.tx);
    expect(f.current().post).toMatchObject({
      isDeleted: true,
      targetExecutionState: TargetExecutionState.CANCELLED,
    });
    expect(f.current().item.reviewFeedback).toContain('expired');
    expect(buildAgentReviewActivity).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({ expired: true, postId: 'post-1' }),
    );
    // Recorded inside the batch transaction, so it commits with the expiry.
    expect(f.activityRecorder.recordInTransaction).toHaveBeenCalledWith(
      f.tx,
      reviewActivity,
    );
  });
  it('preserves interactive drafts without an autonomous origin and respects a configured review window', async () => {
    const interactive = fixture();
    interactive.current().post.agentStrategyId = '';
    expect(
      await interactive.service.expireAutonomousReviewBatch(
        'batch-1',
        'org-1',
        new Date('2026-09-24T00:00:00Z'),
      ),
    ).toEqual([]);
    expect(interactive.lifecycle.transition).not.toHaveBeenCalled();
    const delayed = fixture();
    delayed.policy.resolveForPost.mockResolvedValue({
      reviewTimeoutHours: 168,
      result: { decision: AgentPublishDecision.DENIED },
    });
    expect(
      await delayed.service.expireAutonomousReviewBatch(
        'batch-1',
        'org-1',
        new Date('2026-09-24T00:00:00Z'),
      ),
    ).toEqual([]);
    expect(delayed.lifecycle.transition).not.toHaveBeenCalled();
  });

  it('expiration winning the lock makes a racing approval a replay without a grant', async () => {
    const f = fixture();
    await Promise.all([
      f.service.expireAutonomousReviewBatch('batch-1', 'org-1'),
      f.service.approveItems('batch-1', ['item-1'], 'org-1', 'user-1'),
    ]);
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.current().post.targetExecutionState).toBe(
      TargetExecutionState.CANCELLED,
    );
  });
  it('approval winning the lock prevents expiry and repeated approval cannot mint another grant', async () => {
    const f = fixture();
    await Promise.all([
      f.service.approveItems('batch-1', ['item-1'], 'org-1', 'user-1'),
      f.service.expireAutonomousReviewBatch('batch-1', 'org-1'),
    ]);
    await f.service.approveItems('batch-1', ['item-1'], 'org-1', 'user-1');
    expect(f.approvals.createForCurrentPost).toHaveBeenCalledTimes(1);
    expect(f.policy.recordReviewDecision).toHaveBeenCalledTimes(1);
    expect(f.approvals.invalidatePost).not.toHaveBeenCalled();
    expect(f.current().post.targetExecutionState).toBe(
      TargetExecutionState.SCHEDULED,
    );
  });
  it('rejects callbacks for a prior post version before any grant or rejection', async () => {
    const f = fixture();
    const stale = { 'post-1': '2026-09-19T00:00:00.000Z' };
    await expect(
      f.service.approveItems(
        'batch-1',
        ['item-1'],
        'org-1',
        'user-1',
        false,
        stale,
      ),
    ).rejects.toThrow('older draft version');
    await expect(
      f.service.rejectItems(
        'batch-1',
        ['item-1'],
        'org-1',
        undefined,
        'user-1',
        stale,
      ),
    ).rejects.toThrow('older draft version');
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.approvals.invalidatePost).not.toHaveBeenCalled();
  });

  it('rejects a callback retargeted to a different post or an item without a post', async () => {
    const f = fixture();
    const expected = { 'original-post': '2026-09-20T00:00:00.000Z' };
    await expect(
      f.service.approveItems(
        'batch-1',
        ['item-1'],
        'org-1',
        'user-1',
        false,
        expected,
      ),
    ).rejects.toThrow('expected draft');
    await expect(
      f.service.rejectItems(
        'batch-1',
        ['item-1'],
        'org-1',
        undefined,
        'user-1',
        expected,
      ),
    ).rejects.toThrow('expected draft');
    delete f.current().item.postId;
    await expect(
      f.service.approveItems(
        'batch-1',
        ['item-1'],
        'org-1',
        'user-1',
        false,
        expected,
      ),
    ).rejects.toThrow('expected draft');
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.lifecycle.transition).not.toHaveBeenCalled();
  });

  it('denies autonomous approval inside the transaction even when invoked directly', async () => {
    const f = fixture();
    await expect(
      f.service.approveItems('batch-1', ['item-1'], 'org-1', 'user-1', true),
    ).rejects.toThrow('explicit policy');
    expect(f.approvals.createForCurrentPost).not.toHaveBeenCalled();
    expect(f.policy.recordReviewDecision).not.toHaveBeenCalled();
  });
  it('does not count machine approval toward human graduation', async () => {
    const f = fixture();
    f.policy.resolveForPost.mockResolvedValue({
      reviewTimeoutHours: 24,
      result: { decision: AgentPublishDecision.PERMITTED },
    });
    await f.service.approveItems(
      'batch-1',
      ['item-1'],
      'org-1',
      'user-1',
      true,
    );
    expect(f.approvals.createForCurrentPost).toHaveBeenCalledTimes(1);
    expect(f.policy.recordReviewDecision).not.toHaveBeenCalled();
  });
});
