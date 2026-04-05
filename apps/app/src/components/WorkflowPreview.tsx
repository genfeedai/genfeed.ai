'use client';

import type { NodeType, WorkflowEdge, WorkflowNode } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import type { NodeTypes } from '@xyflow/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { CATEGORY_COLORS, DEFAULT_NODE_COLOR } from '@/lib/constants/colors';
import '@xyflow/react/dist/style.css';
import { memo, useMemo } from 'react';

interface PreviewNodeProps {
  data: { nodeType: NodeType };
}

function PreviewNodeComponent({ data }: PreviewNodeProps) {
  const category = NODE_DEFINITIONS[data.nodeType]?.category ?? 'input';
  const color = CATEGORY_COLORS[category] ?? DEFAULT_NODE_COLOR;

  return (
    <div
      className="rounded"
      style={{
        backgroundColor: color,
        height: 24,
        opacity: 0.9,
        width: 60,
      }}
    />
  );
}

// Generate preview node types from NODE_DEFINITIONS
const previewNodeTypes: NodeTypes = Object.fromEntries(
  Object.keys(NODE_DEFINITIONS).map((key) => [key, PreviewNodeComponent])
);

interface WorkflowPreviewProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

function WorkflowPreviewInner({ nodes, edges }: WorkflowPreviewProps) {
  // Auto-layout nodes by depth (topological order)
  const previewNodes = useMemo(() => {
    if (nodes.length === 0) return [];

    // Build adjacency map (target -> sources)
    const incomingEdges = new Map<string, string[]>();
    for (const edge of edges) {
      const sources = incomingEdges.get(edge.target) ?? [];
      sources.push(edge.source);
      incomingEdges.set(edge.target, sources);
    }

    // Calculate depth for each node (0 = no incoming edges)
    const depths = new Map<string, number>();
    const getDepth = (nodeId: string, visited = new Set<string>()): number => {
      if (visited.has(nodeId)) return 0; // Cycle protection
      if (depths.has(nodeId)) return depths.get(nodeId)!;

      visited.add(nodeId);
      const sources = incomingEdges.get(nodeId) ?? [];
      const depth =
        sources.length === 0 ? 0 : Math.max(...sources.map((s) => getDepth(s, visited))) + 1;
      depths.set(nodeId, depth);
      return depth;
    };

    for (const n of nodes) {
      getDepth(n.id);
    }

    // Group nodes by depth
    const byDepth = new Map<number, typeof nodes>();
    for (const node of nodes) {
      const depth = depths.get(node.id) ?? 0;
      const group = byDepth.get(depth) ?? [];
      group.push(node);
      byDepth.set(depth, group);
    }

    // Layout: horizontal spacing by depth, vertical spacing within depth
    const NODE_WIDTH = 70;
    const NODE_HEIGHT = 35;
    const H_GAP = 20;
    const V_GAP = 10;

    return nodes.map((node) => {
      const depth = depths.get(node.id) ?? 0;
      const group = byDepth.get(depth) ?? [];
      const indexInGroup = group.indexOf(node);

      return {
        ...node,
        data: { ...node.data, nodeType: node.type as NodeType },
        position: {
          x: depth * (NODE_WIDTH + H_GAP) + 10,
          y: indexInGroup * (NODE_HEIGHT + V_GAP) + 10,
        },
      };
    });
  }, [nodes, edges]);

  const previewEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        style: { stroke: '#525252', strokeWidth: 1 },
      })),
    [edges]
  );

  if (nodes.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-xs text-[var(--muted-foreground)]">Empty</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={previewNodes}
        edges={previewEdges}
        nodeTypes={previewNodeTypes}
        fitView
        fitViewOptions={{ maxZoom: 2, minZoom: 0.3, padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        zoomOnPinch={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent', height: '100%', width: '100%' }}
      />
    </div>
  );
}

export const WorkflowPreview = memo(function WorkflowPreview(props: WorkflowPreviewProps) {
  return (
    <ReactFlowProvider>
      <WorkflowPreviewInner {...props} />
    </ReactFlowProvider>
  );
});
