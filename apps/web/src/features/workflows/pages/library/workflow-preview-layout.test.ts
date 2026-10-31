import { describe, expect, it } from 'vitest';
import {
  buildWorkflowPreview,
  PREVIEW_NODE_HEIGHT,
  PREVIEW_NODE_WIDTH,
} from './workflow-preview-layout';

describe('workflow preview layout', () => {
  it('shows real branching topology without mutating stored positions', () => {
    const nodes = ['source', 'left', 'right'].map((id) => ({
      id,
      data: { label: id },
      position: { x: 0, y: 0 },
    }));
    const edges = [
      { source: 'source', target: 'left' },
      { source: 'source', target: 'right' },
    ];
    const before = JSON.stringify({ nodes, edges });
    const graph = buildWorkflowPreview({ nodes, edges });
    expect(graph.edges.map((edge) => [edge.source.id, edge.target.id])).toEqual(
      [
        ['source', 'left'],
        ['source', 'right'],
      ],
    );
    expect(new Set(graph.nodes.map((node) => `${node.x},${node.y}`)).size).toBe(
      3,
    );
    for (const node of graph.nodes) {
      expect(node.x + PREVIEW_NODE_WIDTH).toBeLessThan(graph.width);
      expect(node.y + PREVIEW_NODE_HEIGHT).toBeLessThan(graph.height);
    }
    expect(JSON.stringify({ nodes, edges })).toBe(before);
  });

  it('handles cycles, duplicate nodes and dangling connections without failing a card', () => {
    const graph = buildWorkflowPreview({
      nodes: [
        { id: 'a' },
        { id: 'b' },
        { id: 'a' },
        { id: 'group', type: 'group' },
      ],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
        { source: 'a', target: 'missing' },
      ],
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(
      graph.nodes.every(
        (node) => Number.isFinite(node.x) && Number.isFinite(node.y),
      ),
    ).toBe(true);
  });
});
