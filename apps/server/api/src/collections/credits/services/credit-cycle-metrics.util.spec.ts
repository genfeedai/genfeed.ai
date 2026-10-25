import { computeCycleCredits } from '@api/collections/credits/services/credit-cycle-metrics.util';
import { REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } from '@genfeedai/contracts/constants';

describe('computeCycleCredits', () => {
  it('counts only spend since the latest reset, net of refunds', () => {
    expect(
      computeCycleCredits(100, [
        { amount: 50, balanceAfter: 50, category: 'deduct' },
        { amount: 5900, balanceAfter: 5900, category: 'reset' },
        { amount: 4000, balanceAfter: 9900, category: 'add' },
        { amount: 1500, balanceAfter: 8400, category: 'deduct' },
        { amount: 300, balanceAfter: 8700, category: 'refund' },
        { amount: 20, balanceAfter: 8700, category: 'byok-usage' },
      ]),
    ).toEqual({ cycleTotal: 10_200, cycleUsed: 1_200 });
  });

  it('does not count a referral reward reversal as usage', () => {
    expect(
      computeCycleCredits(0, [
        { amount: 100, balanceAfter: 900, category: 'deduct' },
        {
          amount: 500,
          balanceAfter: 400,
          category: 'deduct',
          referenceType: REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE,
        },
      ]).cycleUsed,
    ).toBe(100);
  });

  it('falls back to the balance before the cycle when there was no reset', () => {
    expect(
      computeCycleCredits(700, [
        { amount: 100, balanceAfter: 600, category: 'deduct' },
      ]),
    ).toEqual({ cycleTotal: 700, cycleUsed: 100 });
  });

  it('never reports negative usage when refunds outweigh spend', () => {
    expect(
      computeCycleCredits(0, [
        { amount: 40, balanceAfter: 40, category: 'refund' },
      ]).cycleUsed,
    ).toBe(0);
  });
});
