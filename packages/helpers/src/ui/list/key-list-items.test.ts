import { describe, expect, it } from 'vitest';
import { keyListItems } from './key-list-items';

describe('keyListItems', () => {
  it('preserves identities across reordering and distinguishes duplicates', () => {
    const before = keyListItems(['a', 'b', 'a'], (item) => item);
    const after = keyListItems(['b', 'a', 'a'], (item) => item);
    expect(after.map(({ key }) => key)).toEqual([
      before[1].key,
      before[0].key,
      before[2].key,
    ]);
    expect(new Set(before.map(({ key }) => key)).size).toBe(3);
  });
});
