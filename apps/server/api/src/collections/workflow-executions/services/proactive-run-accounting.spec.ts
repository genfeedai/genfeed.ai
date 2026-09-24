vi.unmock('@genfeedai/prisma');

import {
  proactiveRunMetadata,
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
