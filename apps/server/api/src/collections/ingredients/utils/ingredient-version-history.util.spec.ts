import {
  classifyVersionRelation,
  orderVersionHistory,
  resolveActiveVersionId,
  type VersionHistoryRow,
} from '@api/collections/ingredients/utils/ingredient-version-history.util';
import { describe, expect, it } from 'vitest';

const row = (overrides: Partial<VersionHistoryRow>): VersionHistoryRow => ({
  activeVersionId: null,
  createdAt: new Date('2026-11-20T10:00:00Z'),
  id: 'a',
  parentId: null,
  relationKind: null,
  version: 1,
  ...overrides,
});

describe('classifyVersionRelation', () => {
  it.each([
    [
      'an asset with no parent',
      { parentId: null, relationKind: null },
      'original',
    ],
    ['a version', { parentId: 'p', relationKind: 'VERSION' }, 'version'],
    [
      'a transformation',
      { parentId: 'p', relationKind: 'TRANSFORMATION' },
      'transformation',
    ],
    [
      'a derivative, which starts a history of its own',
      { parentId: 'p', relationKind: 'DERIVATIVE' },
      'original',
    ],
    [
      'a source, which starts a history of its own',
      { parentId: 'p', relationKind: 'SOURCE' },
      'original',
    ],
    [
      'a legacy link written before relations were recorded',
      { parentId: 'p', relationKind: null },
      'unavailable',
    ],
  ] as const)('classifies %s', (_name, input, expected) => {
    expect(classifyVersionRelation(input)).toBe(expected);
  });
});

describe('orderVersionHistory', () => {
  it('orders by version, then creation time, then id, whatever the input order', () => {
    const early = new Date('2026-11-20T10:00:00Z');
    const late = new Date('2026-11-21T10:00:00Z');
    const rows = [
      row({ createdAt: late, id: 'd', version: 2 }),
      row({ createdAt: early, id: 'c', version: 2 }),
      row({ createdAt: late, id: 'a', version: 1 }),
      row({ createdAt: early, id: 'b', version: 2 }),
    ];
    expect(orderVersionHistory(rows).map(({ id }) => id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(
      orderVersionHistory([...rows].reverse()).map(({ id }) => id),
    ).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('resolveActiveVersionId', () => {
  const ordered = [
    row({ id: 'a' }),
    row({ id: 'b', version: 2 }),
    row({ id: 'c', version: 3 }),
  ];

  it('uses the first asset choice while it is in the history', () => {
    expect(resolveActiveVersionId(ordered, 'b')).toBe('b');
  });

  it('uses the newest entry when nothing was chosen', () => {
    expect(resolveActiveVersionId(ordered, null)).toBe('c');
  });

  it('falls back to the newest entry when the choice left the history', () => {
    expect(resolveActiveVersionId(ordered, 'gone')).toBe('c');
  });
});
