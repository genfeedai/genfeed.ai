'use client';

import { BaseEdge, type EdgeProps, getBezierPath } from '@xyflow/react';
import { useMemo } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';

const REFERENCE_COLOR = '#52525b';

export function ReferenceEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  source,
  target,
}: EdgeProps) {
  const nodes = useWorkflowStore((state) => state.nodes);

  const isConnectedToSelection = useMemo(() => {
    const selectedNodes = nodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return false;
    return selectedNodes.some((n) => n.id === source || n.id === target);
  }, [nodes, source, target]);

  const [edgePath] = useMemo(() => {
    return getBezierPath({
      curvature: 0.25,
      sourcePosition,
      sourceX,
      sourceY,
      targetPosition,
      targetX,
      targetY,
    });
  }, [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]);

  const gradientId = useMemo(() => {
    const selectionKey = isConnectedToSelection ? 'active' : 'dimmed';
    return `reference-gradient-${selectionKey}-${id}`;
  }, [isConnectedToSelection, id]);

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop
            offset="0%"
            stopColor={REFERENCE_COLOR}
            stopOpacity={isConnectedToSelection ? 1 : 0.25}
          />
          <stop
            offset="50%"
            stopColor={REFERENCE_COLOR}
            stopOpacity={isConnectedToSelection ? 0.55 : 0.1}
          />
          <stop
            offset="100%"
            stopColor={REFERENCE_COLOR}
            stopOpacity={isConnectedToSelection ? 1 : 0.25}
          />
        </linearGradient>
      </defs>

      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: `url(#${gradientId})`,
          strokeDasharray: '6 4',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeWidth: 2,
        }}
      />

      {/* Invisible wider path for easier selection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={10}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
    </>
  );
}
