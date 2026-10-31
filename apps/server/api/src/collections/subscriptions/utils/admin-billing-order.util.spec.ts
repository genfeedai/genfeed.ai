import { buildAdminBillingOrderBy } from '@api/collections/subscriptions/utils/admin-billing-order.util';
import { describe, expect, it } from 'vitest';

describe('buildAdminBillingOrderBy', () => {
  it.each([undefined, '', 'balance: 1', 'tier: -1', 'organizationName'])(
    'falls back to newest first for %j',
    (sort) => {
      expect(buildAdminBillingOrderBy(sort)).toEqual([
        { createdAt: 'desc' },
        { id: 'asc' },
      ]);
    },
  );

  it.each([
    [
      'organizationName: 1',
      [{ label: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
    ],
    [
      'organizationName: -1',
      [{ label: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    ],
    [
      'ownerEmail: 1',
      [
        { user: { email: { nulls: 'last', sort: 'asc' } } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    ],
    [
      'ownerEmail: -1, balance: 1',
      [
        { user: { email: { nulls: 'last', sort: 'desc' } } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    ],
  ])('orders by %j with stable tiebreakers', (sort, expected) => {
    expect(buildAdminBillingOrderBy(sort)).toEqual(expected);
  });
});
