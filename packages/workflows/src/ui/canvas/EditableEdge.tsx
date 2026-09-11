'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { HandleType } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { memo, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';

const DATA_TYPE_COLORS: Record<HandleType, [string, string]> = {
  audio: ['#f97316', '#fb923c'], // orange
  image: ['#3b82f6', '#60a5fa'], // blue
  number: ['#6b7280', '#9ca3af'], // gray
  text: ['#22c55e', '#4ade80'], // green
  video: ['#8b5cf6', '#a78bfa'], // purple
};

const DEFAULT_COLORS: [string, string] = ['#6b7280', '#9ca3af'];
const EMPTY_EDGE_STYLE: NonNullable<EdgeProps['style']> = {};

/** Hit-test width (px) around the visible edge path, handled by BaseEdge itself. */
const EDGE_INTERACTION_WIDTH = 20;
/** Gap (px) between the edge midpoint and the bottom of the toolbar above it. */
const TOOLBAR_GAP = 12;

interface EdgeMidpointToolbarProps {
  edgeId: string;
  hasPause: boolean;
  labelX: number;
  labelY: number;
}

function EdgeMidpointToolbar({
  edgeId,
  hasPause,
  labelX,
  labelY,
}: EdgeMidpointToolbarProps) {
  const translate = useTranslations('pages.workflows.edgeToolbar');
  const selectEdge = useUIStore((state) => state.selectEdge);
  const toggleEdgePause = useWorkflowStore((state) => state.toggleEdgePause);
  const removeEdge = useWorkflowStore((state) => state.removeEdge);

  const handleTogglePause = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleEdgePause(edgeId);
    },
    [edgeId, toggleEdgePause],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeEdge(edgeId);
      selectEdge(null);
    },
    [edgeId, removeEdge, selectEdge],
  );

  return (
    <EdgeLabelRenderer>
      <div
        className="nodrag nopan absolute z-30 flex items-center gap-1 bg-background shadow-dropdown px-1.5 py-1"
        onClick={(e) => e.stopPropagation()}
        style={{
          pointerEvents: 'all',
          transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - TOOLBAR_GAP}px)`,
        }}
      >
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleTogglePause}
          title={hasPause ? translate('resumeEdge') : translate('pauseEdge')}
        >
          {hasPause ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
        </Button>
        <div className="h-4 w-px bg-border" />
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleDelete}
          title={translate('deleteEdge')}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </EdgeLabelRenderer>
  );
}

function EditableEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = EMPTY_EDGE_STYLE,
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

      {/* Visible edge; BaseEdge renders its own transparent interaction path
          at `interactionWidth`, so mid-edge clicks reliably hit this edge. */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={EDGE_INTERACTION_WIDTH}
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
          <div className="flex items-center justify-center size-5 rounded-full bg-warning text-warning-foreground shadow-sm">
            <Pause className="size-3" />
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
            className="size-2 rounded-full"
            style={{ backgroundColor: colorStart }}
          />
        </foreignObject>
      )}

      {/* Delete/disconnect toolbar, rendered via the edge label renderer so it
          tracks this edge's own midpoint under pan/zoom. */}
      {selected && (
        <EdgeMidpointToolbar
          edgeId={id}
          hasPause={hasPause}
          labelX={labelX}
          labelY={labelY}
        />
      )}
    </>
  );
}

export const EditableEdge = memo(EditableEdgeComponent);
