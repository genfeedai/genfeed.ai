'use client';

import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, getBezierPath } from '@xyflow/react';
import { Pause } from 'lucide-react';
import { memo } from 'react';

function PauseEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });

  const hasPause = data?.hasPause === true;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          ...(hasPause && {
            stroke: '#f59e0b',
            strokeDasharray: '5 5',
          }),
        }}
      />
      {hasPause && (
        <foreignObject
          width={20}
          height={20}
          x={labelX - 10}
          y={labelY - 10}
          className="pointer-events-none"
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white">
            <Pause className="w-3 h-3" />
          </div>
        </foreignObject>
      )}
    </>
  );
}

export const PauseEdge = memo(PauseEdgeComponent);
