import { describe, expect, it } from 'vitest';
import { topologicalSort } from './topological-sort';

describe('topologicalSort', () => {
  it('orders a diamond', () => {
    const order = topologicalSort(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
        { source: 'b', target: 'd' },
        { source: 'c', target: 'd' },
      ],
    );
    expect(order[0]).toBe('a');
    expect(order[3]).toBe('d');
    expect(new Set(order)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('returns an empty list for no nodes', () => {
    expect(topologicalSort([], [])).toEqual([]);
  });
});
