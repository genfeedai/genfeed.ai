import { SubscriptionPlan } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { getSubscriptionCycleWindow } from './credit-cycle-window.util';

describe('getSubscriptionCycleWindow', () => {
  const periodEnd = new Date('2026-11-30T00:00:00.000Z');

  it('starts a monthly period one month before it ends', () => {
    expect(
      getSubscriptionCycleWindow({
        currentPeriodEnd: periodEnd,
        plan: SubscriptionPlan.MONTHLY,
      }),
    ).toEqual({
      cycleEndAt: periodEnd,
      cycleStartAt: new Date('2026-10-30T00:00:00.000Z'),
    });
  });

  it('starts a yearly period one year before it ends', () => {
    expect(
      getSubscriptionCycleWindow({
        currentPeriodEnd: periodEnd,
        plan: SubscriptionPlan.YEARLY,
      }),
    ).toEqual({
      cycleEndAt: periodEnd,
      cycleStartAt: new Date('2025-11-30T00:00:00.000Z'),
    });
  });

  it.each([
    ['no subscription', null],
    [
      'no period end',
      { currentPeriodEnd: null, plan: SubscriptionPlan.MONTHLY },
    ],
    ['no plan', { currentPeriodEnd: periodEnd, plan: null }],
    ['an unknown plan', { currentPeriodEnd: periodEnd, plan: 'lifetime' }],
  ])('has no window for %s', (_label, subscription) => {
    expect(getSubscriptionCycleWindow(subscription)).toBeNull();
  });
});
