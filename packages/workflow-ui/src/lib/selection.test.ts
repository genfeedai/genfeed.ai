import { describe, expect, it } from 'vitest';

import {
  createIdLookup,
  filterItemsByIdLookup,
  findGroupContainingNodeId,
  hasEveryId,
  hasSomeId,
  mergeIds,
  removeIds,
} from './selection';

describe('createIdLookup', () => {
  it('creates a lookup set from ids', () => {
    const lookup = createIdLookup(['node-1', 'node-2']);

    expect(lookup.has('node-1')).toBe(true);
    expect(lookup.has('node-2')).toBe(true);
    expect(lookup.has('node-3')).toBe(false);
  });
});

describe('filterItemsByIdLookup', () => {
  it('returns items whose ids exist in the lookup', () => {
    const items = [
      { id: 'node-1', label: 'One' },
      { id: 'node-2', label: 'Two' },
      { id: 'node-3', label: 'Three' },
    ];

    expect(
      filterItemsByIdLookup(items, createIdLookup(['node-1', 'node-3'])),
    ).toEqual([
      { id: 'node-1', label: 'One' },
      { id: 'node-3', label: 'Three' },
    ]);
  });

  it('returns an empty array when the lookup is empty', () => {
    const items = [{ id: 'node-1', label: 'One' }];

    expect(filterItemsByIdLookup(items, createIdLookup([]))).toEqual([]);
  });
});

describe('hasEveryId', () => {
  it('returns true when every id exists in the lookup', () => {
    expect(
      hasEveryId(
        ['node-1', 'node-2'],
        createIdLookup(['node-1', 'node-2', 'node-3']),
      ),
    ).toBe(true);
  });

  it('returns false when an id is missing from the lookup', () => {
    expect(
      hasEveryId(
        ['node-1', 'node-4'],
        createIdLookup(['node-1', 'node-2', 'node-3']),
      ),
    ).toBe(false);
  });
});

describe('hasSomeId', () => {
  it('returns true when at least one id exists in the lookup', () => {
    expect(
      hasSomeId(
        ['node-4', 'node-2'],
        createIdLookup(['node-1', 'node-2', 'node-3']),
      ),
    ).toBe(true);
  });

  it('returns false when no ids exist in the lookup', () => {
    expect(
      hasSomeId(
        ['node-4', 'node-5'],
        createIdLookup(['node-1', 'node-2', 'node-3']),
      ),
    ).toBe(false);
  });
});

describe('mergeIds', () => {
  it('preserves order and appends only new ids', () => {
    expect(
      mergeIds(['node-1', 'node-2'], ['node-2', 'node-3', 'node-4']),
    ).toEqual(['node-1', 'node-2', 'node-3', 'node-4']);
  });

  it('returns a shallow copy when there is nothing to add', () => {
    const existingIds = ['node-1', 'node-2'];

    const result = mergeIds(existingIds, []);
    expect(result).toEqual(existingIds);
    expect(result).not.toBe(existingIds);
  });
});

describe('removeIds', () => {
  it('removes only the requested ids', () => {
    expect(removeIds(['node-1', 'node-2', 'node-3'], ['node-2'])).toEqual([
      'node-1',
      'node-3',
    ]);
  });

  it('returns a shallow copy when there is nothing to remove', () => {
    const existingIds = ['node-1', 'node-2'];

    const result = removeIds(existingIds, []);
    expect(result).toEqual(existingIds);
    expect(result).not.toBe(existingIds);
  });
});

describe('findGroupContainingNodeId', () => {
  it('returns the first group containing the node id', () => {
    const groups = [
      { id: 'group-1', nodeIds: ['node-1', 'node-2'] },
      { id: 'group-2', nodeIds: ['node-3'] },
    ];

    expect(findGroupContainingNodeId(groups, 'node-2')).toEqual(groups[0]);
  });

  it('returns undefined when no group contains the node id', () => {
    const groups = [{ id: 'group-1', nodeIds: ['node-1', 'node-2'] }];

    expect(findGroupContainingNodeId(groups, 'node-9')).toBeUndefined();
  });
});
