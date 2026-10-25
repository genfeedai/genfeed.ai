import { describe, expect, it } from 'vitest';
import { getPlanUsage } from './plan-usage';

describe('getPlanUsage', () => {
  it('counts spend even when extra credits keep the balance above the plan', () => {
    expect(
      getPlanUsage({ balance: 10_171, cycleUsed: 1_629, planLimit: 5_900 }),
    ).toEqual({
      extraBalance: 5_900,
      planBalance: 4_271,
      planLimit: 5_900,
      planUsagePercent: (1_629 / 5_900) * 100,
      planUsed: 1_629,
    });
  });

  it('caps plan usage at the plan size and leaves the rest as extra', () => {
    const usage = getPlanUsage({
      balance: 3_000,
      cycleUsed: 8_000,
      planLimit: 5_900,
    });

    expect(usage.planUsed).toBe(5_900);
    expect(usage.planUsagePercent).toBe(100);
    expect(usage.planBalance).toBe(0);
    expect(usage.extraBalance).toBe(3_000);
  });

  it('never reports more plan balance than the wallet holds', () => {
    const usage = getPlanUsage({
      balance: 100,
      cycleUsed: 0,
      planLimit: 5_900,
    });

    expect(usage.planBalance).toBe(100);
    expect(usage.extraBalance).toBe(0);
  });

  it('treats the whole balance as extra without a plan meter', () => {
    expect(
      getPlanUsage({ balance: 42, cycleUsed: 10, planLimit: 0 }),
    ).toMatchObject({ extraBalance: 42, planLimit: 0, planUsed: 0 });
  });

  it('reports nothing while the balance is unknown', () => {
    expect(
      getPlanUsage({ balance: null, cycleUsed: 10, planLimit: 100 }),
    ).toMatchObject({ extraBalance: 0, planUsagePercent: 0, planUsed: 0 });
  });
});
