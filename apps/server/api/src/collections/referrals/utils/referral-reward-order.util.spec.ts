import { buildReferralRewardOrderBy } from '@api/collections/referrals/utils/referral-reward-order.util';
import { describe, expect, it } from 'vitest';

describe('buildReferralRewardOrderBy', () => {
  it.each([
    undefined,
    '',
    'failureReason: 1',
    'referrerBillingAccountId: -1',
    'status',
  ])('falls back to newest first for %j', (sort) => {
    expect(buildReferralRewardOrderBy(sort)).toEqual([
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it.each([
    ['status: 1', [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]],
    [
      'netAmountCents: -1',
      [{ netAmountCents: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ],
    [
      'eligibleAt: 1',
      [{ eligibleAt: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ],
    [
      'attemptCount: -1, failureReason: 1',
      [{ attemptCount: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ],
  ])('orders by %j with stable tiebreakers', (sort, expected) => {
    expect(buildReferralRewardOrderBy(sort)).toEqual(expected);
  });
});
