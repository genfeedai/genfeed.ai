import {
  buildUserOrderBy,
  buildUserSearchWhere,
} from '@api/collections/users/controllers/users-search.helpers';
import { describe, expect, it } from 'vitest';

describe('buildUserSearchWhere', () => {
  it.each([undefined, '', '   '])('adds no constraint for %j', (search) => {
    expect(buildUserSearchWhere(search)).toEqual({});
  });

  it('matches email, names and handle case-insensitively on the trimmed term', () => {
    const contains = { contains: 'ada', mode: 'insensitive' };

    expect(buildUserSearchWhere('  ada ')).toEqual({
      OR: [
        { email: contains },
        { firstName: contains },
        { lastName: contains },
        { name: contains },
        { handle: contains },
      ],
    });
  });
});

describe('buildUserOrderBy', () => {
  it.each([undefined, '', 'password: 1', 'handle: -1', 'email'])(
    'falls back to newest first for %j',
    (sort) => {
      expect(buildUserOrderBy(sort)).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    },
  );

  it.each([
    [
      'email: 1',
      [
        { email: { nulls: 'last', sort: 'asc' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
    [
      'lastActiveAt: -1',
      [
        { lastActiveAt: { nulls: 'last', sort: 'desc' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
    [
      'name: 1',
      [
        { name: { nulls: 'last', sort: 'asc' } },
        { firstName: { nulls: 'last', sort: 'asc' } },
        { lastName: { nulls: 'last', sort: 'asc' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
    ['createdAt: 1', [{ createdAt: 'asc' }, { id: 'desc' }]],
    [
      'email: -1, password: 1',
      [
        { email: { nulls: 'last', sort: 'desc' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
  ])('orders by %j with stable tiebreakers', (sort, expected) => {
    expect(buildUserOrderBy(sort)).toEqual(expected);
  });
});
