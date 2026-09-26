import type { BatchItemFull } from '@api/services/batch-generation/batch-generation.types';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { recordAgentReviewOutcome } from '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import {
  AgentPublishDecision,
  BatchItemStatus,
  BatchStatus,
  ContentFormat,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock(
  '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service',
  () => ({ recordAgentReviewOutcome: vi.fn().mockResolvedValue('delivery-1') }),
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
  const batch = () => ({
    id: 'batch-1',
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
    config: {},
    items: [{ ...item }],
    status: BatchStatus.COMPLETED,
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
  const service = new BatchGenerationReviewService(
    prisma as never,
    { log: vi.fn() } as never,
    {} as never,
    lifecycle as never,
    approvals as never,
    { toBatchSummary: async (row: unknown) => row } as never,
    policy as never,
  );
  return {
    service,
    tx,
    approvals,
    lifecycle,
    policy,
    calls,
    current: () => ({ item, post }),
  };
}

describe('Autonomous review transaction boundary', () => {
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
    expect(recordAgentReviewOutcome).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({ expired: true, postId: 'post-1' }),
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
