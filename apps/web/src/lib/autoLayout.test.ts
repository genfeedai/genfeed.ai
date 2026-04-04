import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { getLayoutedNodes } from './autoLayout';

describe('getLayoutedNodes', () => {
  const createNode = (id: string, x = 0, y = 0): Node => ({
    data: {},
    id,
    position: { x, y },
    type: 'default',
  });

  const createEdge = (source: string, target: string): Edge => ({
    id: `${source}-${target}`,
    source,
    target,
  });

  describe('basic layout', () => {
    it('should return empty array for empty nodes', () => {
      const result = getLayoutedNodes([], []);
      expect(result).toHaveLength(0);
    });

    it('should layout a single node', () => {
      const nodes = [createNode('node-1')];
      const result = getLayoutedNodes(nodes, []);

      expect(result).toHaveLength(1);
      expect(result[0].position).toBeDefined();
      expect(typeof result[0].position.x).toBe('number');
      expect(typeof result[0].position.y).toBe('number');
    });

    it('should layout two connected nodes', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];
      const edges = [createEdge('node-1', 'node-2')];

      const result = getLayoutedNodes(nodes, edges);

      expect(result).toHaveLength(2);
      // With LR layout, node-2 should be to the right of node-1
      const node1 = result.find((n) => n.id === 'node-1');
      const node2 = result.find((n) => n.id === 'node-2');
      expect(node1).toBeDefined();
      expect(node2).toBeDefined();
      expect(node2!.position.x).toBeGreaterThan(node1!.position.x);
    });

    it('should layout multiple connected nodes in a chain', () => {
      const nodes = [createNode('node-1'), createNode('node-2'), createNode('node-3')];
      const edges = [createEdge('node-1', 'node-2'), createEdge('node-2', 'node-3')];

      const result = getLayoutedNodes(nodes, edges);

      expect(result).toHaveLength(3);
      const positions = result.map((n) => n.position.x);
      // With LR layout, nodes should be ordered left to right
      expect(positions[0]).toBeLessThan(positions[1]);
      expect(positions[1]).toBeLessThan(positions[2]);
    });
  });

  describe('direction option', () => {
    it('should layout nodes left to right with LR direction', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];
      const edges = [createEdge('node-1', 'node-2')];

      const result = getLayoutedNodes(nodes, edges, { direction: 'LR' });

      const node1 = result.find((n) => n.id === 'node-1');
      const node2 = result.find((n) => n.id === 'node-2');
      expect(node2!.position.x).toBeGreaterThan(node1!.position.x);
    });

    it('should layout nodes top to bottom with TB direction', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];
      const edges = [createEdge('node-1', 'node-2')];

      const result = getLayoutedNodes(nodes, edges, { direction: 'TB' });

      const node1 = result.find((n) => n.id === 'node-1');
      const node2 = result.find((n) => n.id === 'node-2');
      expect(node2!.position.y).toBeGreaterThan(node1!.position.y);
    });

    it('should layout nodes right to left with RL direction', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];
      const edges = [createEdge('node-1', 'node-2')];

      const result = getLayoutedNodes(nodes, edges, { direction: 'RL' });

      const node1 = result.find((n) => n.id === 'node-1');
      const node2 = result.find((n) => n.id === 'node-2');
      expect(node1!.position.x).toBeGreaterThan(node2!.position.x);
    });

    it('should layout nodes bottom to top with BT direction', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];
      const edges = [createEdge('node-1', 'node-2')];

      const result = getLayoutedNodes(nodes, edges, { direction: 'BT' });

      const node1 = result.find((n) => n.id === 'node-1');
      const node2 = result.find((n) => n.id === 'node-2');
      expect(node1!.position.y).toBeGreaterThan(node2!.position.y);
    });
  });

  describe('spacing options', () => {
    it('should respect nodeSpacing option', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];

      const smallSpacing = getLayoutedNodes(nodes, [], { nodeSpacing: 10 });
      const largeSpacing = getLayoutedNodes(nodes, [], { nodeSpacing: 200 });

      const smallDiff = Math.abs(smallSpacing[0].position.y - smallSpacing[1].position.y);
      const largeDiff = Math.abs(largeSpacing[0].position.y - largeSpacing[1].position.y);

      expect(largeDiff).toBeGreaterThan(smallDiff);
    });

    it('should respect rankSpacing option for connected nodes', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];
      const edges = [createEdge('node-1', 'node-2')];

      const smallRank = getLayoutedNodes(nodes, edges, { rankSpacing: 50 });
      const largeRank = getLayoutedNodes(nodes, edges, { rankSpacing: 300 });

      const smallDiff = Math.abs(smallRank[0].position.x - smallRank[1].position.x);
      const largeDiff = Math.abs(largeRank[0].position.x - largeRank[1].position.x);

      expect(largeDiff).toBeGreaterThan(smallDiff);
    });
  });

  describe('measured dimensions', () => {
    it('should use measured dimensions when available', () => {
      const nodes: Node[] = [
        {
          data: {},
          id: 'node-1',
          measured: { height: 200, width: 300 },
          position: { x: 0, y: 0 },
          type: 'default',
        },
        {
          data: {},
          id: 'node-2',
          measured: { height: 200, width: 300 },
          position: { x: 0, y: 0 },
          type: 'default',
        },
      ];
      const edges = [createEdge('node-1', 'node-2')];

      const result = getLayoutedNodes(nodes, edges);

      expect(result).toHaveLength(2);
      // Nodes should be positioned considering their measured dimensions
      expect(result[0].position).toBeDefined();
      expect(result[1].position).toBeDefined();
    });

    it('should use default dimensions when measured not available', () => {
      const nodes = [createNode('node-1'), createNode('node-2')];
      const edges = [createEdge('node-1', 'node-2')];

      const result = getLayoutedNodes(nodes, edges);

      expect(result).toHaveLength(2);
      expect(result[0].position).toBeDefined();
    });
  });

  describe('complex graphs', () => {
    it('should handle branching workflows', () => {
      const nodes = [
        createNode('start'),
        createNode('branch-1'),
        createNode('branch-2'),
        createNode('end'),
      ];
      const edges = [
        createEdge('start', 'branch-1'),
        createEdge('start', 'branch-2'),
        createEdge('branch-1', 'end'),
        createEdge('branch-2', 'end'),
      ];

      const result = getLayoutedNodes(nodes, edges);

      expect(result).toHaveLength(4);
      // All nodes should have valid positions
      for (const node of result) {
        expect(typeof node.position.x).toBe('number');
        expect(typeof node.position.y).toBe('number');
        expect(Number.isFinite(node.position.x)).toBe(true);
        expect(Number.isFinite(node.position.y)).toBe(true);
      }
    });

    it('should handle disconnected nodes', () => {
      const nodes = [
        createNode('group-1-a'),
        createNode('group-1-b'),
        createNode('group-2-a'),
        createNode('group-2-b'),
      ];
      const edges = [createEdge('group-1-a', 'group-1-b'), createEdge('group-2-a', 'group-2-b')];

      const result = getLayoutedNodes(nodes, edges);

      expect(result).toHaveLength(4);
    });

    it('should preserve node data and type', () => {
      const nodes: Node[] = [
        {
          data: { model: 'nano-banana', prompt: 'test' },
          id: 'node-1',
          position: { x: 0, y: 0 },
          type: 'imageGen',
        },
      ];

      const result = getLayoutedNodes(nodes, []);

      expect(result[0].type).toBe('imageGen');
      expect(result[0].data).toEqual({ model: 'nano-banana', prompt: 'test' });
    });
  });
});
