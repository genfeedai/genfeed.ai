'use client';

import type { HandleType } from '@genfeedai/types';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, getBezierPath } from '@xyflow/react';
import { Pause } from 'lucide-react';
import { memo } from 'react';

const DATA_TYPE_COLORS: Record<HandleType, [string, string]> = {
  audio: ['#f97316', '#fb923c'], // orange
  image: ['#3b82f6', '#60a5fa'], // blue
  number: ['#6b7280', '#9ca3af'], // gray
  text: ['#22c55e', '#4ade80'], // green
  video: ['#8b5cf6', '#a78bfa'], // purple
};

const DEFAULT_COLORS: [string, string] = ['#6b7280', '#9ca3af'];

function EditableEdgeComponent({
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
  selected,
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
  const dataType = (data?.dataType as HandleType) ?? null;
  const [colorStart, colorEnd] = dataType
    ? (DATA_TYPE_COLORS[dataType] ?? DEFAULT_COLORS)
    : DEFAULT_COLORS;

  const gradientId = `edge-gradient-${id}`;

  return (
    <>
      {/* Gradient definition */}
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={colorStart} />
          <stop offset="100%" stopColor={colorEnd} />
        </linearGradient>
      </defs>

      {/* Transparent hit area for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />

      {/* Visible edge */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: `url(#${gradientId})`,
          strokeWidth: selected ? 3 : 2,
          ...(hasPause && {
            strokeDasharray: '8 4',
          }),
        }}
      />

      {/* Pause indicator at midpoint */}
      {hasPause && (
        <foreignObject
          width={20}
          height={20}
          x={labelX - 10}
          y={labelY - 10}
          className="pointer-events-none"
        >
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white shadow-sm">
            <Pause className="w-3 h-3" />
          </div>
        </foreignObject>
      )}

      {/* Selection indicator */}
      {selected && !hasPause && (
        <foreignObject
          width={8}
          height={8}
          x={labelX - 4}
          y={labelY - 4}
          className="pointer-events-none"
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: colorStart }}
          />
        </foreignObject>
      )}
    </>
  );
}

export const EditableEdge = memo(EditableEdgeComponent);
