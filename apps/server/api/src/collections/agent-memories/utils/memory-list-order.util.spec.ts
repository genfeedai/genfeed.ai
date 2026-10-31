import { buildMemoryListOrderBy } from '@api/collections/agent-memories/utils/memory-list-order.util';
import { describe, expect, it } from 'vitest';

describe('buildMemoryListOrderBy', () => {
  it.each([undefined, '', 'content: 1', 'userId: -1'])(
    'falls back to newest first for %j',
    (sort) => {
      expect(buildMemoryListOrderBy(sort)).toEqual([
        { createdAt: 'desc' },
        { id: 'desc' },
      ]);
    },
  );

  it.each([
    [
      'summary: 1',
      [
        { summary: { nulls: 'last', sort: 'asc' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
    ['scope: -1', [{ scope: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]],
    [
      'user: 1',
      [
        { user: { name: { nulls: 'last', sort: 'asc' } } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
    [
      'promotedSkillId: -1',
      [
        { promotedSkillId: { nulls: 'last', sort: 'desc' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    ],
    ['createdAt: 1', [{ createdAt: 'asc' }, { id: 'desc' }]],
  ])('orders by %j with stable tiebreakers', (sort, expected) => {
    expect(buildMemoryListOrderBy(sort)).toEqual(expected);
  });
});
