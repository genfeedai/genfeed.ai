import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';
import {
  deriveLatestProposedPlan,
  resolveLatestProposedPlan,
} from '@genfeedai/agent/utils/resolve-latest-proposed-plan.util';
import { describe, expect, it } from 'vitest';

function makePlan(
  id: string,
  createdAt: string,
  overrides: Partial<AgentProposedPlan> = {},
): AgentProposedPlan {
  return {
    createdAt,
    id,
    status: 'awaiting_approval',
    updatedAt: createdAt,
    ...overrides,
  };
}

const planA = makePlan('plan-a', '2026-09-28T10:00:00.000Z');
const planB = makePlan('plan-b', '2026-09-28T10:05:00.000Z');

describe('resolveLatestProposedPlan', () => {
  it('keeps the current plan when there is no incoming plan', () => {
    expect(resolveLatestProposedPlan(planA, null)).toBe(planA);
    expect(resolveLatestProposedPlan(planA, undefined)).toBe(planA);
  });

  it('never blocks on a missing or unparseable timestamp', () => {
    const undated = { id: 'plan-c' } as AgentProposedPlan;
    const garbled = makePlan('plan-d', 'not-a-date');

    expect(resolveLatestProposedPlan(planB, undated)).toBe(undated);
    expect(resolveLatestProposedPlan(planB, garbled)).toBe(garbled);
  });
});

/**
 * The shape the agent drafted plans in before they were timestamped (and the
 * only shape a plan already persisted in a thread has): an id minted as
 * `plan-<ms>` and nothing else to order it by.
 */
function makeUntimestampedPlan(createdAtMs: number): AgentProposedPlan {
  return {
    awaitingApproval: true,
    content: 'Do the thing',
    id: `plan-${createdAtMs}`,
    status: 'awaiting_approval',
  } as AgentProposedPlan;
}

describe('untimestamped plans', () => {
  const planB = makeUntimestampedPlan(1_790_000_500_000);
  const approvedA: AgentProposedPlan = {
    approvedAt: '2026-09-28T10:06:00.000Z',
    awaitingApproval: false,
    content: 'Do the thing',
    createdAt: '2026-09-28T10:00:00.000Z',
    id: 'plan-1790000000000',
    lastReviewAction: 'approve',
    status: 'approved',
    updatedAt: '2026-09-28T10:06:00.000Z',
  };

  it('orders untimestamped plans by the drafting time in their ids', () => {
    const older = makeUntimestampedPlan(1_790_000_000_000);

    expect(resolveLatestProposedPlan(planB, older)).toBe(planB);
    expect(resolveLatestProposedPlan(older, planB)).toBe(planB);
  });

  it('applies the approval of an untimestamped plan', () => {
    const approved: AgentProposedPlan = {
      ...planB,
      approvedAt: '2026-09-28T10:07:00.000Z',
      awaitingApproval: false,
      status: 'approved',
      updatedAt: '2026-09-28T10:07:00.000Z',
    };

    expect(resolveLatestProposedPlan(planB, approved)).toBe(approved);
  });

  it('falls back to arrival order when plans cannot be ordered', () => {
    const first = { id: 'plan-x' } as AgentProposedPlan;
    const second = { id: 'plan-y' } as AgentProposedPlan;

    expect(resolveLatestProposedPlan(first, second)).toBe(second);
  });
});

describe('deriveLatestProposedPlan', () => {
  it('returns the newest plan even when an older plan is listed after it', () => {
    const approvedA = makePlan('plan-a', planA.createdAt, {
      status: 'approved',
      updatedAt: '2026-09-28T10:06:00.000Z',
    });

    expect(deriveLatestProposedPlan([planA, planB, approvedA, undefined])).toBe(
      planB,
    );
  });
});
