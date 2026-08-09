import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { getLayoutedNodes } from './autoLayout';

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    data: {},
    id,
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeEdge(source: string, target: string, targetHandle?: string): Edge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    ...(targetHandle ? { targetHandle } : {}),
  };
}

function overlaps(a: Node, b: Node, gap = 0): boolean {
  const aw = a.measured?.width ?? 280;
  const ah = a.measured?.height ?? 200;
  const bw = b.measured?.width ?? 280;
  const bh = b.measured?.height ?? 200;
  return (
    a.position.x < b.position.x + bw + gap &&
    a.position.x + aw + gap > b.position.x &&
    a.position.y < b.position.y + bh + gap &&
    a.position.y + ah + gap > b.position.y
  );
}

describe('getLayoutedNodes', () => {
  it('returns the same array for empty input', () => {
    const nodes: Node[] = [];
    expect(getLayoutedNodes(nodes, [])).toBe(nodes);
  });

  it('positions a single node with margins', () => {
    const [node] = getLayoutedNodes([makeNode('a')], []);
    expect(Number.isFinite(node.position.x)).toBe(true);
    expect(Number.isFinite(node.position.y)).toBe(true);
  });

  it('lays out a chain left-to-right by default', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')];

    const result = getLayoutedNodes(nodes, edges);
    const byId = new Map(result.map((n) => [n.id, n]));

    expect(byId.get('a')!.position.x).toBeLessThan(byId.get('b')!.position.x);
    expect(byId.get('b')!.position.x).toBeLessThan(byId.get('c')!.position.x);
  });

  it('lays out top-to-bottom when direction is TB', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result = getLayoutedNodes(nodes, edges, { direction: 'TB' });
    const byId = new Map(result.map((n) => [n.id, n]));

    expect(byId.get('a')!.position.y).toBeLessThan(byId.get('b')!.position.y);
  });

  it('does not mutate the input node objects', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    getLayoutedNodes(nodes, edges);
    expect(nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('separates disconnected overlapping nodes', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    const result = getLayoutedNodes(nodes, []);

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        expect(
          overlaps(result[i], result[j]),
          `${result[i].id} overlaps ${result[j].id}`,
        ).toBe(false);
      }
    }
  });

  it('uses measured dimensions when present', () => {
    const wide = makeNode('a', { measured: { height: 100, width: 800 } });
    const next = makeNode('b');
    const result = getLayoutedNodes([wide, next], [makeEdge('a', 'b')]);
    const byId = new Map(result.map((n) => [n.id, n]));

    // b must start after a's full 800px width plus rank spacing
    expect(byId.get('b')!.position.x).toBeGreaterThan(
      byId.get('a')!.position.x + 800,
    );
  });

  it('orders sources to match their target handle order', () => {
    // lipSync has ordered inputs (video, audio); sources connecting to the
    // first handle should end up above sources connecting to the second.
    const nodes = [
      makeNode('video-src'),
      makeNode('audio-src'),
      makeNode('sink', { type: 'lipSync' }),
    ];
    const edges = [
      makeEdge('audio-src', 'sink', 'audio'),
      makeEdge('video-src', 'sink', 'video'),
    ];

    const result = getLayoutedNodes(nodes, edges);
    const byId = new Map(result.map((n) => [n.id, n]));

    expect(byId.get('video-src')!.position.y).toBeLessThanOrEqual(
      byId.get('audio-src')!.position.y,
    );
  });

  it('pushes ranks apart on the x axis when rank spacing collapses', () => {
    // rankSpacing 0 makes dagre butt consecutive ranks together; collision
    // resolution has to reopen the minimum gap horizontally.
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const result = getLayoutedNodes(nodes, edges, { rankSpacing: 0 });
    const byId = new Map(result.map((n) => [n.id, n]));
    const a = byId.get('a')!;
    const b = byId.get('b')!;

    expect(overlaps(a, b)).toBe(false);
    expect(b.position.x - a.position.x).toBeGreaterThanOrEqual(280);
    // the push is symmetric, so the y axis is untouched
    expect(a.position.y).toBeCloseTo(b.position.y, 5);
  });

  it('pushes siblings apart on the y axis when node spacing collapses', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('sink')];
    const edges = [makeEdge('a', 'sink'), makeEdge('b', 'sink')];

    const result = getLayoutedNodes(nodes, edges, { nodeSpacing: 0 });
    const byId = new Map(result.map((n) => [n.id, n]));
    const a = byId.get('a')!;
    const b = byId.get('b')!;

    expect(overlaps(a, b)).toBe(false);
    expect(Math.abs(b.position.y - a.position.y)).toBeGreaterThanOrEqual(200);
  });

  it('separates a dense sibling fan with mixed measured sizes', () => {
    const nodes = [
      makeNode('s1', { measured: { height: 400, width: 200 } }),
      makeNode('s2', { measured: { height: 100, width: 500 } }),
      makeNode('s3', { measured: { height: 250, width: 300 } }),
      makeNode('sink', { type: 'lipSync' }),
    ];
    const edges = [
      makeEdge('s1', 'sink', 'audio'),
      makeEdge('s2', 'sink', 'video'),
      makeEdge('s3', 'sink', 'audio'),
    ];

    const result = getLayoutedNodes(nodes, edges, {
      nodeSpacing: 0,
      rankSpacing: 0,
    });

    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        expect(
          overlaps(result[i], result[j]),
          `${result[i].id} overlaps ${result[j].id}`,
        ).toBe(false);
      }
    }
  });

  it('leaves nodes untouched when the target node is missing from the graph', () => {
    // The edge points at a node that was never supplied; handle reordering
    // must skip it instead of throwing.
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [
      makeEdge('a', 'ghost', 'video'),
      makeEdge('b', 'ghost', 'audio'),
    ];

    expect(() => getLayoutedNodes(nodes, edges)).not.toThrow();
  });

  it('ignores edges whose source node is missing', () => {
    const nodes = [makeNode('a'), makeNode('sink', { type: 'lipSync' })];
    const edges = [
      makeEdge('a', 'sink', 'video'),
      makeEdge('ghost', 'sink', 'audio'),
    ];

    expect(() => getLayoutedNodes(nodes, edges)).not.toThrow();
  });

  it('treats unknown node types and handles as handle index zero', () => {
    const nodes = [
      makeNode('a'),
      makeNode('b'),
      makeNode('sink', { type: 'notARealNodeType' }),
    ];
    const edges = [
      makeEdge('a', 'sink', 'nope'),
      makeEdge('b', 'sink', 'alsoNope'),
    ];

    const result = getLayoutedNodes(nodes, edges);
    expect(result).toHaveLength(3);
    expect(result.every((n) => Number.isFinite(n.position.y))).toBe(true);
  });

  it('respects custom spacing options', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [makeEdge('a', 'b')];

    const tight = getLayoutedNodes(nodes, edges, { rankSpacing: 60 });
    const loose = getLayoutedNodes(nodes, edges, { rankSpacing: 400 });

    const gap = (result: Node[]): number => {
      const byId = new Map(result.map((n) => [n.id, n]));
      return byId.get('b')!.position.x - byId.get('a')!.position.x;
    };

    expect(gap(loose)).toBeGreaterThan(gap(tight));
  });
});
