'use client';

import type { WorkflowNodeData } from '@genfeedai/interfaces/automation/workflow-builder.interface';
import type { WorkflowCanvasProps } from '@genfeedai/props/automation/workflow-builder.props';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  ReactFlow,
  type OnNodesChange as ReactFlowOnNodesChange,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import AINode from '@ui/workflow-builder/nodes/AINode';
import ControlNode from '@ui/workflow-builder/nodes/ControlNode';
import EffectsNode from '@ui/workflow-builder/nodes/EffectsNode';
import InputNode from '@ui/workflow-builder/nodes/InputNode';
import OutputNode from '@ui/workflow-builder/nodes/OutputNode';
import ProcessNode from '@ui/workflow-builder/nodes/ProcessNode';
import { useCallback, useMemo, useRef } from 'react';

const NODE_TYPES = {
  'ai-node': AINode,
  'control-node': ControlNode,
  'effects-node': EffectsNode,
  'input-node': InputNode,
  'output-node': OutputNode,
  'process-node': ProcessNode,
};

export default function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeSelect,
  onDrop,
  isReadOnly = false,
}: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      onDrop(event, position);
    },
    [screenToFlowPosition, onDrop],
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: { id: string }) => {
      onNodeSelect(node.id);
    },
    [onNodeSelect],
  );

  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const defaultEdgeOptions = useMemo(
    () => ({
      animated: true,
      style: { strokeWidth: 2 },
      type: 'smoothstep',
    }),
    [],
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes as Node[]}
        edges={edges}
        onNodesChange={onNodesChange as ReactFlowOnNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        nodeTypes={NODE_TYPES}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        nodesDraggable={!isReadOnly}
        nodesConnectable={!isReadOnly}
        elementsSelectable={!isReadOnly}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={!isReadOnly} />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as WorkflowNodeData;
            switch (data.definition?.category) {
              case 'input':
                return '#22c55e';
              case 'processing':
                return '#3b82f6';
              case 'effects':
                return '#a855f7';
              case 'ai':
                return '#f59e0b';
              case 'output':
                return '#ef4444';
              case 'control':
                return '#6b7280';
              default:
                return '#9ca3af';
            }
          }}
          maskColor="rgba(0, 0, 0, 0.2)"
        />
        <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
      </ReactFlow>
    </div>
  );
}
