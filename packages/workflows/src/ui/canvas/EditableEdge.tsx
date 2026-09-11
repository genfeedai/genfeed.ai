'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { HandleType } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeToolbar, getBezierPath } from '@xyflow/react';
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
/** Gap (px, in flow coordinates) between the edge midpoint and the toolbar above it. */
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
  // A box-selection can mark many edges `selected` at once (xyflow's own
  // per-edge flag); only the edge the user explicitly clicked shows a
  // toolbar, so selecting a cluster of nodes doesn't scatter toolbars
  // across the canvas.
  const isSingleSelected = useUIStore(
    (state) => state.selectedEdgeId === edgeId,
  );
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
    <EdgeToolbar
      edgeId={edgeId}
      x={labelX}
      y={labelY - TOOLBAR_GAP}
      isVisible={isSingleSelected}
      alignY="bottom"
      className="nodrag nopan z-30 flex items-center gap-1 bg-background shadow-dropdown px-1.5 py-1"
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
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
    </EdgeToolbar>
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

      {/* Delete/disconnect toolbar. Mounted whenever xyflow marks this edge
          `selected` (including box-selection), but EdgeMidpointToolbar only
          actually shows it for the single edge the user explicitly clicked
          (see isSingleSelected). Uses xyflow's own EdgeToolbar, which tracks
          the edge's midpoint under pan/zoom and counter-scales its content
          so it stays a fixed size regardless of zoom level. */}
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
