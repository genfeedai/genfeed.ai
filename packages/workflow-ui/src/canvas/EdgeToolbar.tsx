'use client';

import { useReactFlow } from '@xyflow/react';
import { Pause, Play, Trash2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';

function EdgeToolbarComponent() {
  const { selectedEdgeId, selectEdge } = useUIStore();
  const { edges, toggleEdgePause, removeEdge } = useWorkflowStore();
  const reactFlow = useReactFlow();

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null),
    [selectedEdgeId, edges],
  );

  const position = useMemo(() => {
    if (!selectedEdge) return null;

    // Get source and target node positions to compute midpoint
    const sourceNode = reactFlow.getNode(selectedEdge.source);
    const targetNode = reactFlow.getNode(selectedEdge.target);
    if (!sourceNode || !targetNode) return null;

    const midX =
      (sourceNode.position.x +
        (sourceNode.measured?.width ?? 280) / 2 +
        (targetNode.position.x + (targetNode.measured?.width ?? 280) / 2)) /
      2;
    const midY =
      (sourceNode.position.y +
        (sourceNode.measured?.height ?? 200) / 2 +
        (targetNode.position.y + (targetNode.measured?.height ?? 200) / 2)) /
      2;

    return reactFlow.flowToScreenPosition({ x: midX, y: midY });
  }, [selectedEdge, reactFlow]);

  if (!selectedEdge || !position) return null;

  const hasPause = selectedEdge.data?.hasPause === true;

  const handleTogglePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleEdgePause(selectedEdge.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeEdge(selectedEdge.id);
    selectEdge(null);
  };

  return (
    <div
      className="fixed z-30 flex items-center gap-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg px-1.5 py-1"
      style={{
        left: position.x,
        top: position.y - 40,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleTogglePause}
        title={hasPause ? 'Resume edge' : 'Pause edge'}
      >
        {hasPause ? (
          <Play className="h-3.5 w-3.5" />
        ) : (
          <Pause className="h-3.5 w-3.5" />
        )}
      </Button>
      <div className="h-4 w-px bg-[var(--border)]" />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleDelete}
        title="Delete edge"
        className="hover:bg-red-500/10 hover:text-red-500"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export const EdgeToolbar = memo(EdgeToolbarComponent);
