vi.unmock('@genfeedai/prisma');

import {
  proactiveRunMetadata,
  recordProactiveRunCompletion,
  resolveProactiveConsumedCredits,
  withProactiveConsumedCredits,
} from '@api/collections/workflow-executions/services/proactive-run-accounting';
import { describe, expect, it, vi } from 'vitest';

const input = {
  executionId: 'run',
  organizationId: 'org',
  failed: false,
  executionCredits: 0,
  result: {},
};
function persistence(nodes: unknown[] = [], ledger: unknown[] = []) {
  return {
    workflowExecutionNodeResult: { findMany: vi.fn().mockResolvedValue(nodes) },
    creditTransaction: { findMany: vi.fn().mockResolvedValue(ledger) },
  };
}

describe('proactive consumed-credit evidence', () => {
  it('qualifies only proactive canonical turn executions', () => {
    expect(
      proactiveRunMetadata({
        metadata: {
          canonicalId: 'agent.turn.execute',
          source: 'proactive',
          strategyId: 'strategy',
        },
      }),
    ).toEqual({ strategyId: 'strategy' });
    for (const metadata of [
      {},
      { canonicalId: 'other', source: 'proactive', strategyId: 'strategy' },
      {
        canonicalId: 'agent.turn.execute',
        source: 'api',
        strategyId: 'strategy',
      },
    ])
      expect(proactiveRunMetadata({ metadata })).toBeNull();
  });
  it('does not treat a reported turn budget or reservation estimate as consumed', async () => {
    const tx = persistence([
      { nodeId: 'finalize-turn', output: { creditsUsed: 100 } },
    ]);
    expect(await resolveProactiveConsumedCredits(tx as never, input)).toBe(0);
    expect(tx.workflowExecutionNodeResult.findMany).not.toHaveBeenCalled();
  });
  it('uses tenant/execution ledger deduct minus refund on failure, ignoring successful output', async () => {
    const tx = persistence(
      [{ nodeId: 'finalize-turn', output: { creditsUsed: 50 } }],
      [
        { category: 'deduct', amount: -0.3 },
        { category: 'refund', amount: 0.03 },
      ],
    );
    expect(await resolveProactiveConsumedCredits(tx as never, input)).toBe(
      0.27,
    );
    expect(tx.creditTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workflowExecutionId: 'run',
          organizationId: 'org',
          isDeleted: false,
          category: { in: ['deduct', 'refund'] },
        },
      }),
    );
  });
  it('records zero-charge failures and clamps net refunds', async () => {
    expect(
      await resolveProactiveConsumedCredits(persistence() as never, input),
    ).toBe(0);
    expect(
      await resolveProactiveConsumedCredits(
        persistence([], [{ category: 'refund', amount: 4 }]) as never,
        input,
      ),
    ).toBe(0);
  });
  it('preserves exact consumption receipt and other metadata', () => {
    expect(
      withProactiveConsumedCredits(
        { metadata: { strategyId: 'strategy' }, output: 1 },
        0.27,
      ),
    ).toEqual({
      metadata: { strategyId: 'strategy', proactiveCreditsUsed: 0.27 },
      output: 1,
    });
  });
});

describe('proactive snapshot provenance', () => {
  it('passes the enqueued snapshot to history without changing ledger-derived credit accounting', async () => {
    const snapshot = {
      bestPlatformFormatPairs: [],
      bestPostingWindows: [],
      clicks: 0,
      costPerVisit: null,
      creditsSpent: 0,
      ctr: 0,
      generatedCount: 0,
      impressions: 0,
      publishedCount: 0,
      topHooks: [],
      topTopics: [],
      visits: null,
    };
    const execution = {
      id: 'run',
      organizationId: 'org',
      startedAt: new Date(),
      result: {
        metadata: {
          canonicalId: 'agent.turn.execute',
          source: 'proactive',
          strategyId: 'strategy',
          threadId: 'thread',
          performanceSnapshot: snapshot,
        },
      },
    };
    const transaction = {
      ...persistence([], [{ category: 'deduct', amount: -2 }]),
      workflowExecution: {
        findUnique: vi.fn().mockResolvedValue(execution),
        update: vi.fn().mockResolvedValue(execution),
      },
      post: { count: vi.fn().mockResolvedValue(1) },
      agentStrategy: {
        findFirst: vi.fn().mockResolvedValue({
          brandId: 'brand',
          label: 'Daily agent',
          brand: { slug: 'brand' },
          organization: { slug: 'org' },
        }),
      },
      agentStrategyReport: {
        upsert: vi.fn().mockResolvedValue({ id: 'report' }),
      },
    };
    const strategies = { recordRun: vi.fn() };
    await recordProactiveRunCompletion(
      transaction as never,
      strategies as never,
      'run',
      { completedAt: new Date(), failed: false },
    );
    expect(transaction.agentStrategyReport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'agent-run:run', organizationId: 'org', isDeleted: false },
        update: {},
        create: expect.objectContaining({
          strategyId: 'strategy',
          organizationId: 'org',
          brandId: 'brand',
          data: expect.objectContaining({
            generatedCount: 1,
            publishedCount: 1,
            creditsSpent: 2,
            reportType: 'daily',
            visits: null,
            summary:
              '1 posts created; 1 published; 1 waiting for review. 2 credits used.',
            metadata: expect.objectContaining({
              performanceSnapshot: snapshot,
              performanceSnapshotAvailable: true,
              measurementBasis: expect.stringContaining(
                'captured before this run',
              ),
            }),
          }),
        }),
      }),
    );
    expect(transaction.post.count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        workflowExecutionId: 'run',
        agentStrategyId: 'strategy',
        targetExecutionState: 'draft',
        reviewDecision: null,
      },
    });
    expect(strategies.recordRun).toHaveBeenCalledWith(
      'strategy',
      expect.objectContaining({
        performanceSnapshot: snapshot,
        creditsUsed: 2,
        contentGenerated: 1,
        threadId: 'thread',
        executionId: 'run',
      }),
      'org',
      transaction,
    );
  });
});

it('stores safe empty report fields and a failure summary for legacy runs without a valid snapshot', async () => {
  const execution = {
    id: 'run',
    organizationId: 'org',
    startedAt: null,
    result: {
      metadata: {
        canonicalId: 'agent.turn.execute',
        source: 'proactive',
        strategyId: 'strategy',
        performanceSnapshot: { bestPlatformFormatPairs: 'invalid' },
      },
    },
  };
  const transaction = {
    ...persistence(),
    workflowExecution: {
      findUnique: vi.fn().mockResolvedValue(execution),
      update: vi.fn().mockResolvedValue(execution),
    },
    post: { count: vi.fn().mockResolvedValue(0) },
    agentStrategy: {
      findFirst: vi.fn().mockResolvedValue({
        brandId: null,
        label: 'Agent',
        brand: null,
        organization: { slug: 'org' },
      }),
    },
    agentStrategyReport: { upsert: vi.fn() },
  };
  await recordProactiveRunCompletion(
    transaction as never,
    { recordRun: vi.fn() } as never,
    'run',
    { completedAt: new Date('2026-09-24T12:00:00Z'), failed: true },
  );
  expect(transaction.agentStrategyReport.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        data: expect.objectContaining({
          generatedCount: 0,
          publishedCount: 0,
          creditsSpent: 0,
          impressions: 0,
          clicks: 0,
          topHooks: [],
          bestPostingWindows: [],
          allocationChanges: [],
          visits: null,
          costPerVisit: null,
          periodStart: '2026-09-24T00:00:00.000Z',
          metadata: expect.objectContaining({
            performanceSnapshotAvailable: false,
          }),
          summary: expect.stringContaining('run failed'),
        }),
      }),
    }),
  );
  expect(transaction.workflowExecution.update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        result: expect.objectContaining({
          metadata: expect.objectContaining({
            agentReport: expect.objectContaining({ sourcePath: null }),
          }),
        }),
      },
    }),
  );
});
