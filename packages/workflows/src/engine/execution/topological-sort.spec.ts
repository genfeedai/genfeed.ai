import { describe, expect, it } from 'vitest';
import { topologicalSort } from './topological-sort';

describe('topologicalSort', () => {
  it('orders a linear chain', () => {
    expect(
      topologicalSort(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
        ],
      ),
    ).toEqual(['a', 'b', 'c']);
  });

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

  it('restricts to a node subset', () => {
    expect(
      topologicalSort(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
        ],
        ['b', 'c'],
      ),
    ).toEqual(['b', 'c']);
  });

  it('ignores edges whose endpoints are missing', () => {
    expect(
      topologicalSort(
        [{ id: 'a' }, { id: 'b' }],
        [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'ghost' },
          { source: 'ghost', target: 'a' },
        ],
      ),
    ).toEqual(['a', 'b']);
  });

  it('returns an empty list for no nodes', () => {
    expect(topologicalSort([], [])).toEqual([]);
  });
});
