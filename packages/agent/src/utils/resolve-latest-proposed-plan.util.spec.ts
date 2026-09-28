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
  it('applies the first plan', () => {
    expect(resolveLatestProposedPlan(null, planA)).toBe(planA);
  });

  it('keeps the current plan when there is no incoming plan', () => {
    expect(resolveLatestProposedPlan(planA, null)).toBe(planA);
    expect(resolveLatestProposedPlan(planA, undefined)).toBe(planA);
  });

  it('applies the approval of the current plan', () => {
    const approved = makePlan('plan-a', planA.createdAt, {
      approvedAt: '2026-09-28T10:01:00.000Z',
      status: 'approved',
      updatedAt: '2026-09-28T10:01:00.000Z',
    });

    expect(resolveLatestProposedPlan(planA, approved)).toBe(approved);
  });

  it('ignores a stale copy of the current plan', () => {
    const approved = makePlan('plan-a', planA.createdAt, {
      status: 'approved',
      updatedAt: '2026-09-28T10:01:00.000Z',
    });

    expect(resolveLatestProposedPlan(approved, planA)).toBe(approved);
  });

  it('ignores an older plan from an earlier run once a newer plan arrived', () => {
    const approvedA = makePlan('plan-a', planA.createdAt, {
      status: 'approved',
      updatedAt: '2026-09-28T10:06:00.000Z',
    });

    expect(resolveLatestProposedPlan(planB, approvedA)).toBe(planB);
  });

  it('applies a newer plan over an older one', () => {
    expect(resolveLatestProposedPlan(planA, planB)).toBe(planB);
  });

  it('never blocks on a missing or unparseable timestamp', () => {
    const undated = { id: 'plan-c' } as AgentProposedPlan;
    const garbled = makePlan('plan-d', 'not-a-date');

    expect(resolveLatestProposedPlan(planB, undated)).toBe(undated);
    expect(resolveLatestProposedPlan(planB, garbled)).toBe(garbled);
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

  it('returns null without plans', () => {
    expect(deriveLatestProposedPlan([undefined, null])).toBeNull();
  });
});
