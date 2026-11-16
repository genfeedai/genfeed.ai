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

  it('clamps a month-end period to the previous month, not into the month after', () => {
    expect(
      getSubscriptionCycleWindow({
        currentPeriodEnd: new Date('2026-03-31T00:00:00.000Z'),
        plan: SubscriptionPlan.MONTHLY,
      })?.cycleStartAt,
    ).toEqual(new Date('2026-02-28T00:00:00.000Z'));
  });

  it('starts a yearly period ending on a leap day on the last day of February', () => {
    expect(
      getSubscriptionCycleWindow({
        currentPeriodEnd: new Date('2028-02-29T00:00:00.000Z'),
        plan: SubscriptionPlan.YEARLY,
      })?.cycleStartAt,
    ).toEqual(new Date('2027-02-28T00:00:00.000Z'));
  });

  it('uses the persisted period start over the derived one', () => {
    expect(
      getSubscriptionCycleWindow({
        currentPeriodEnd: new Date('2026-02-28T00:00:00.000Z'),
        currentPeriodStart: new Date('2026-01-31T00:00:00.000Z'),
        plan: SubscriptionPlan.MONTHLY,
      })?.cycleStartAt,
    ).toEqual(new Date('2026-01-31T00:00:00.000Z'));
  });

  it('ignores a persisted start that is not before the period end', () => {
    expect(
      getSubscriptionCycleWindow({
        currentPeriodEnd: new Date('2026-03-31T00:00:00.000Z'),
        currentPeriodStart: new Date('2026-04-02T00:00:00.000Z'),
        plan: SubscriptionPlan.MONTHLY,
      })?.cycleStartAt,
    ).toEqual(new Date('2026-02-28T00:00:00.000Z'));
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
