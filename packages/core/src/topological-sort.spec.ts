import { describe, expect, it } from 'vitest';
import { buildDependencyMap, topologicalSort } from './topological-sort';

describe('topologicalSort', () => {
  it('should return empty array for empty inputs', () => {
    const result = topologicalSort([], []);
    expect(result).toEqual([]);
  });

  it('should return single node when there are no edges', () => {
    const nodes = [{ id: 'node1' }];
    const result = topologicalSort(nodes, []);
    expect(result).toEqual(['node1']);
  });

  it('should return all nodes when there are no edges', () => {
    const nodes = [{ id: 'node1' }, { id: 'node2' }, { id: 'node3' }];
    const result = topologicalSort(nodes, []);
    expect(result).toHaveLength(3);
    expect(result).toContain('node1');
    expect(result).toContain('node2');
    expect(result).toContain('node3');
  });

  it('should sort nodes in dependency order for linear graph', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
    ];

    const result = topologicalSort(nodes, edges);

    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'));
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('C'));
  });

  it('should handle diamond dependency pattern', () => {
    // A -> B -> D
    // A -> C -> D
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'B', target: 'D' },
      { source: 'C', target: 'D' },
    ];

    const result = topologicalSort(nodes, edges);

    expect(result.indexOf('A')).toBeLessThan(result.indexOf('B'));
    expect(result.indexOf('A')).toBeLessThan(result.indexOf('C'));
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('D'));
    expect(result.indexOf('C')).toBeLessThan(result.indexOf('D'));
  });

  it('should handle multiple sources', () => {
    // A -> C
    // B -> C
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'C' },
      { source: 'B', target: 'C' },
    ];

    const result = topologicalSort(nodes, edges);

    expect(result.indexOf('A')).toBeLessThan(result.indexOf('C'));
    expect(result.indexOf('B')).toBeLessThan(result.indexOf('C'));
  });

  it('should handle multiple sinks', () => {
    // A -> B
    // A -> C
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
    ];

    const result = topologicalSort(nodes, edges);

    expect(result[0]).toBe('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
  });

  it('should handle complex workflow graph', () => {
    // promptInput -> imageGen -> preview
    // imageInput -> imageGen
    const nodes = [
      { id: 'promptInput' },
      { id: 'imageInput' },
      { id: 'imageGen' },
      { id: 'preview' },
    ];
    const edges = [
      { source: 'promptInput', target: 'imageGen' },
      { source: 'imageInput', target: 'imageGen' },
      { source: 'imageGen', target: 'preview' },
    ];

    const result = topologicalSort(nodes, edges);

    expect(result.indexOf('promptInput')).toBeLessThan(
      result.indexOf('imageGen'),
    );
    expect(result.indexOf('imageInput')).toBeLessThan(
      result.indexOf('imageGen'),
    );
    expect(result.indexOf('imageGen')).toBeLessThan(result.indexOf('preview'));
  });

  it('should not include nodes with cyclic dependencies in output', () => {
    // A -> B -> C -> A (cycle)
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'A' },
    ];

    const result = topologicalSort(nodes, edges);

    // With a cycle, topological sort cannot include all nodes
    expect(result.length).toBeLessThan(nodes.length);
  });

  it('should handle edges referencing non-existent nodes', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }];
    const edges = [{ source: 'A', target: 'C' }]; // C doesn't exist

    const result = topologicalSort(nodes, edges);

    expect(result).toContain('A');
    expect(result).toContain('B');
  });
});

describe('buildDependencyMap', () => {
  it('should return empty map for empty inputs', () => {
    const result = buildDependencyMap([], []);
    expect(result.size).toBe(0);
  });

  it('should create entries for all nodes with empty deps', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const result = buildDependencyMap(nodes, []);

    expect(result.get('A')).toEqual([]);
    expect(result.get('B')).toEqual([]);
    expect(result.get('C')).toEqual([]);
  });

  it('should map dependencies correctly for single edge', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }];
    const edges = [{ source: 'A', target: 'B' }];

    const result = buildDependencyMap(nodes, edges);

    expect(result.get('A')).toEqual([]);
    expect(result.get('B')).toEqual(['A']);
  });

  it('should map dependencies correctly for multiple edges', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'C' },
      { source: 'B', target: 'C' },
    ];

    const result = buildDependencyMap(nodes, edges);

    expect(result.get('A')).toEqual([]);
    expect(result.get('B')).toEqual([]);
    expect(result.get('C')).toEqual(['A', 'B']);
  });

  it('should handle diamond pattern', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'B', target: 'D' },
      { source: 'C', target: 'D' },
    ];

    const result = buildDependencyMap(nodes, edges);

    expect(result.get('A')).toEqual([]);
    expect(result.get('B')).toEqual(['A']);
    expect(result.get('C')).toEqual(['A']);
    expect(result.get('D')).toEqual(['B', 'C']);
  });

  it('should handle workflow-like structure', () => {
    // promptNode -> imageGen -> output
    // imageInput -> imageGen
    const nodes = [
      { id: 'promptNode' },
      { id: 'imageInput' },
      { id: 'imageGen' },
      { id: 'output' },
    ];
    const edges = [
      { source: 'promptNode', target: 'imageGen' },
      { source: 'imageInput', target: 'imageGen' },
      { source: 'imageGen', target: 'output' },
    ];

    const result = buildDependencyMap(nodes, edges);

    expect(result.get('promptNode')).toEqual([]);
    expect(result.get('imageInput')).toEqual([]);
    expect(result.get('imageGen')).toEqual(['promptNode', 'imageInput']);
    expect(result.get('output')).toEqual(['imageGen']);
  });

  it('should handle edges to non-existent targets', () => {
    const nodes = [{ id: 'A' }, { id: 'B' }];
    const edges = [{ source: 'A', target: 'C' }]; // C doesn't exist

    const result = buildDependencyMap(nodes, edges);

    expect(result.get('A')).toEqual([]);
    expect(result.get('B')).toEqual([]);
    // C was not in nodes, so it gets added during edge processing
    expect(result.get('C')).toEqual(['A']);
  });
});
