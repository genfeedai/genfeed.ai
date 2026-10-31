import { buildMemberOrderBy } from '@api/collections/members/utils/member-list-order.util';
import { describe, expect, it } from 'vitest';

describe('buildMemberOrderBy', () => {
  it.each([undefined, '', 'password: 1', 'roleKey: -1'])(
    'falls back to newest first for %j',
    (sort) => {
      expect(buildMemberOrderBy(sort)).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    },
  );

  it.each([
    [
      'userFullName: 1',
      [
        { user: { firstName: { nulls: 'last', sort: 'asc' } } },
        { user: { lastName: { nulls: 'last', sort: 'asc' } } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
    [
      'roleLabel: -1',
      [{ role: { label: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }],
    ],
    [
      'isActive: 1',
      [{ isActive: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ],
    ['createdAt: 1', [{ createdAt: 'asc' }, { id: 'desc' }]],
    [
      'roleLabel: 1, password: -1',
      [{ role: { label: 'asc' } }, { createdAt: 'desc' }, { id: 'desc' }],
    ],
  ])('orders by %j with stable tiebreakers', (sort, expected) => {
    expect(buildMemberOrderBy(sort)).toEqual(expected);
  });
});
