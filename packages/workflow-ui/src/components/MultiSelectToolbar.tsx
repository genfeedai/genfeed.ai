'use client';

import type { WorkflowNode } from '@genfeedai/types';
import { useReactFlow } from '@xyflow/react';
import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Grid3X3,
  Group,
  Ungroup,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';

const NODE_GAP = 32;
const EST_NODE_WIDTH = 280;
const EST_NODE_HEIGHT = 200;

interface MultiSelectToolbarProps {
  onDownloadAsZip?: (nodes: WorkflowNode[]) => void;
}

function MultiSelectToolbarComponent({
  onDownloadAsZip,
}: MultiSelectToolbarProps) {
  const {
    nodes,
    selectedNodeIds,
    onNodesChange,
    createGroup,
    deleteGroup,
    groups,
  } = useWorkflowStore();
  const reactFlow = useReactFlow();

  const selectedNodes = useMemo(
    () => nodes.filter((n) => selectedNodeIds.includes(n.id)),
    [nodes, selectedNodeIds],
  );

  // Find if selected nodes belong to a group
  const selectedGroup = useMemo(() => {
    if (selectedNodes.length < 2) return null;
    return (
      groups.find((g) =>
        selectedNodeIds.every((id) => g.nodeIds.includes(id)),
      ) ?? null
    );
  }, [groups, selectedNodeIds, selectedNodes.length]);

  // Position: above bounding box of selected nodes
  const toolbarPosition = useMemo(() => {
    if (selectedNodes.length < 2) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;

    for (const node of selectedNodes) {
      const x = node.position.x;
      const y = node.position.y;
      const w = node.measured?.width ?? EST_NODE_WIDTH;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
    }

    const centerX = (minX + maxX) / 2;
    const topY = minY - 48;

    return reactFlow.flowToScreenPosition({ x: centerX, y: topY });
  }, [selectedNodes, reactFlow]);

  const stackHorizontal = useCallback(() => {
    if (selectedNodes.length < 2) return;
    const sorted = [...selectedNodes].sort(
      (a, b) => a.position.x - b.position.x,
    );
    const baseY = sorted[0].position.y;

    const changes = sorted.map((node, i) => ({
      id: node.id,
      position: {
        x: sorted[0].position.x + i * (EST_NODE_WIDTH + NODE_GAP),
        y: baseY,
      },
      type: 'position' as const,
    }));

    onNodesChange(changes);
  }, [selectedNodes, onNodesChange]);

  const stackVertical = useCallback(() => {
    if (selectedNodes.length < 2) return;
    const sorted = [...selectedNodes].sort(
      (a, b) => a.position.y - b.position.y,
    );
    const baseX = sorted[0].position.x;

    const changes = sorted.map((node, i) => ({
      id: node.id,
      position: {
        x: baseX,
        y: sorted[0].position.y + i * (EST_NODE_HEIGHT + NODE_GAP),
      },
      type: 'position' as const,
    }));

    onNodesChange(changes);
  }, [selectedNodes, onNodesChange]);

  const arrangeGrid = useCallback(() => {
    if (selectedNodes.length < 2) return;
    const cols = Math.ceil(Math.sqrt(selectedNodes.length));

    // Sort nodes top-to-bottom, left-to-right
    const sorted = [...selectedNodes].sort((a, b) => {
      const rowDiff =
        Math.floor(a.position.y / EST_NODE_HEIGHT) -
        Math.floor(b.position.y / EST_NODE_HEIGHT);
      if (rowDiff !== 0) return rowDiff;
      return a.position.x - b.position.x;
    });

    const baseX = sorted[0].position.x;
    const baseY = sorted[0].position.y;

    const changes = sorted.map((node, i) => ({
      id: node.id,
      position: {
        x: baseX + (i % cols) * (EST_NODE_WIDTH + NODE_GAP),
        y: baseY + Math.floor(i / cols) * (EST_NODE_HEIGHT + NODE_GAP),
      },
      type: 'position' as const,
    }));

    onNodesChange(changes);
  }, [selectedNodes, onNodesChange]);

  const handleGroup = useCallback(() => {
    if (selectedNodeIds.length < 2) return;
    createGroup(selectedNodeIds);
  }, [selectedNodeIds, createGroup]);

  const handleUngroup = useCallback(() => {
    if (!selectedGroup) return;
    deleteGroup(selectedGroup.id);
  }, [selectedGroup, deleteGroup]);

  if (selectedNodes.length < 2 || !toolbarPosition) return null;

  return (
    <div
      className="fixed z-30 flex items-center gap-1 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg px-1.5 py-1"
      style={{
        left: toolbarPosition.x,
        top: toolbarPosition.y,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Selection count */}
      <span className="px-1.5 text-xs font-medium text-[var(--muted-foreground)]">
        {selectedNodeIds.length}
      </span>

      <div className="h-4 w-px bg-[var(--border)]" />

      {/* Stack Horizontal */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={stackHorizontal}
        title="Stack horizontal"
      >
        <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
      </Button>

      {/* Stack Vertical */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={stackVertical}
        title="Stack vertical"
      >
        <AlignVerticalSpaceAround className="h-3.5 w-3.5" />
      </Button>

      {/* Grid */}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={arrangeGrid}
        title="Arrange as grid"
      >
        <Grid3X3 className="h-3.5 w-3.5" />
      </Button>

      <div className="h-4 w-px bg-[var(--border)]" />

      {/* Group / Ungroup */}
      {selectedGroup ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleUngroup}
          title="Ungroup"
        >
          <Ungroup className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleGroup}
          title="Group"
        >
          <Group className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export const MultiSelectToolbar = memo(MultiSelectToolbarComponent);
