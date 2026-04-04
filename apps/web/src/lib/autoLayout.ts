import Dagre from '@dagrejs/dagre';
import type { NodeType } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import type { Edge, Node } from '@xyflow/react';

interface LayoutOptions {
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
  nodeSpacing?: number;
  rankSpacing?: number;
}

const DEFAULT_NODE_WIDTH = 280;
const DEFAULT_NODE_HEIGHT = 200;
const MIN_GAP = 40;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Get node bounding box from current position
 */
function getNodeRect(node: Node): Rect {
  return {
    height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
    width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
    x: node.position.x,
    y: node.position.y,
  };
}

/**
 * Get the index of an input handle on a node (used for vertical ordering)
 */
function getInputHandleIndex(nodeType: string, handleId: string): number {
  const nodeDef = NODE_DEFINITIONS[nodeType as NodeType];
  if (!nodeDef) return 0;
  const index = nodeDef.inputs.findIndex((h) => h.id === handleId);
  return index === -1 ? 0 : index;
}

/**
 * Check if two rectangles overlap (including gap)
 */
function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Calculate overlap amount on each axis
 */
function getOverlap(a: Rect, b: Rect, gap: number): { x: number; y: number } {
  const aCenterX = a.x + a.width / 2;
  const aCenterY = a.y + a.height / 2;
  const bCenterX = b.x + b.width / 2;
  const bCenterY = b.y + b.height / 2;

  const dx = bCenterX - aCenterX;
  const dy = bCenterY - aCenterY;

  const minDistX = (a.width + b.width) / 2 + gap;
  const minDistY = (a.height + b.height) / 2 + gap;

  const overlapX = minDistX - Math.abs(dx);
  const overlapY = minDistY - Math.abs(dy);

  return { x: overlapX, y: overlapY };
}

/**
 * Reorder nodes vertically based on which handle they connect to on the target.
 * This minimizes edge crossings by placing nodes that connect to top handles
 * above nodes that connect to bottom handles.
 */
function reorderByHandlePosition(nodes: Node[], edges: Edge[]): Node[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Group edges by target node
  const edgesByTarget = new Map<string, Edge[]>();
  for (const edge of edges) {
    const existing = edgesByTarget.get(edge.target) ?? [];
    existing.push(edge);
    edgesByTarget.set(edge.target, existing);
  }

  // For each target, reorder its source nodes based on handle index
  for (const [targetId, targetEdges] of edgesByTarget) {
    if (targetEdges.length < 2) continue;

    const targetNode = nodeMap.get(targetId);
    if (!targetNode) continue;

    // Get source nodes with their target handle indices
    const sourceInfos: { nodeId: string; handleIndex: number; currentY: number }[] = [];

    for (const edge of targetEdges) {
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) continue;

      const handleIndex = getInputHandleIndex(targetNode.type as string, edge.targetHandle ?? '');
      sourceInfos.push({
        currentY: sourceNode.position.y,
        handleIndex,
        nodeId: edge.source,
      });
    }

    if (sourceInfos.length < 2) continue;

    // Sort by handle index (top handles first)
    sourceInfos.sort((a, b) => a.handleIndex - b.handleIndex);

    // Get the Y positions sorted (top positions first)
    const sortedYPositions = sourceInfos.map((s) => s.currentY).sort((a, b) => a - b);

    // Assign Y positions: node connecting to top handle gets top Y position
    for (let i = 0; i < sourceInfos.length; i++) {
      const node = nodeMap.get(sourceInfos[i].nodeId);
      if (node) {
        node.position.y = sortedYPositions[i];
      }
    }
  }

  return nodes;
}

/**
 * Resolve all overlaps using iterative collision detection
 * Based on xyflow's recommended naive O(n²) approach
 * https://xyflow.com/blog/node-collision-detection-algorithms
 */
function resolveCollisions(nodes: Node[]): Node[] {
  const maxIterations = 100;
  let iteration = 0;
  let hasCollision = true;

  while (hasCollision && iteration < maxIterations) {
    hasCollision = false;
    iteration++;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const rectA = getNodeRect(nodeA);
        const rectB = getNodeRect(nodeB);

        if (rectsOverlap(rectA, rectB, MIN_GAP)) {
          hasCollision = true;

          const overlap = getOverlap(rectA, rectB, MIN_GAP);

          const aCenterX = rectA.x + rectA.width / 2;
          const aCenterY = rectA.y + rectA.height / 2;
          const bCenterX = rectB.x + rectB.width / 2;
          const bCenterY = rectB.y + rectB.height / 2;

          if (overlap.x < overlap.y && overlap.x > 0) {
            const pushX = overlap.x / 2;
            if (bCenterX >= aCenterX) {
              nodeA.position.x -= pushX;
              nodeB.position.x += pushX;
            } else {
              nodeA.position.x += pushX;
              nodeB.position.x -= pushX;
            }
          } else if (overlap.y > 0) {
            const pushY = overlap.y / 2;
            if (bCenterY >= aCenterY) {
              nodeA.position.y -= pushY;
              nodeB.position.y += pushY;
            } else {
              nodeA.position.y += pushY;
              nodeB.position.y -= pushY;
            }
          }
        }
      }
    }
  }

  return nodes;
}

/**
 * Auto-layout nodes using dagre algorithm with collision resolution
 * @param nodes - React Flow nodes
 * @param edges - React Flow edges
 * @param options - Layout configuration
 * @returns Nodes with updated positions
 */
export function getLayoutedNodes(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Node[] {
  if (nodes.length === 0) return nodes;

  const { direction = 'LR', nodeSpacing = 50, rankSpacing = 120 } = options;

  const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  graph.setGraph({
    acyclicer: 'greedy',
    marginx: 50,
    marginy: 50,
    nodesep: nodeSpacing,
    rankdir: direction,
    ranker: 'network-simplex',
    ranksep: rankSpacing,
  });

  // Add nodes with their actual measured dimensions
  for (const node of nodes) {
    const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;
    graph.setNode(node.id, { height, width });
  }

  // Add edges
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  Dagre.layout(graph);

  // Apply dagre positions (dagre returns center coordinates)
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = graph.node(node.id);
    const width = node.measured?.width ?? DEFAULT_NODE_WIDTH;
    const height = node.measured?.height ?? DEFAULT_NODE_HEIGHT;

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  // Reorder nodes to minimize edge crossings based on handle positions
  reorderByHandlePosition(layoutedNodes, edges);

  // Resolve any remaining overlaps with collision detection
  return resolveCollisions(layoutedNodes);
}
