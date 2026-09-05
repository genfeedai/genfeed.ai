'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';

import type { WorkflowNode } from '@genfeedai/contracts/types';
import { Button } from '@genfeedai/ui/primitives/button';
import { useReactFlow } from '@xyflow/react';
import {
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Download,
  Grid3X3,
  Group,
  Ungroup,
} from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import {
  createIdLookup,
  filterItemsByIdLookup,
  hasEveryId,
} from '../lib/selection';
import { useWorkflowStore } from '../stores/workflow';

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
  const selectedNodeIdLookup = useMemo(
    () => createIdLookup(selectedNodeIds),
    [selectedNodeIds],
  );

  const selectedNodes = useMemo(
    () => filterItemsByIdLookup(nodes, selectedNodeIdLookup),
    [nodes, selectedNodeIdLookup],
  );

  // Find if selected nodes belong to a group
  const selectedGroup = useMemo(() => {
    if (selectedNodes.length < 2) return null;
    return (
      groups.find((g) =>
        hasEveryId(selectedNodeIds, createIdLookup(g.nodeIds)),
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
    const sorted = selectedNodes.toSorted(
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
    const sorted = selectedNodes.toSorted(
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
    const sorted = selectedNodes.toSorted((a, b) => {
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

  const handleDownloadAsZip = useCallback(() => {
    if (!onDownloadAsZip || selectedNodes.length === 0) return;
    onDownloadAsZip(selectedNodes);
  }, [onDownloadAsZip, selectedNodes]);

  if (selectedNodes.length < 2 || !toolbarPosition) return null;

  return (
    <div
      className="fixed z-30 flex items-center gap-1 bg-background border border-border shadow-lg px-1.5 py-1"
      style={{
        left: toolbarPosition.x,
        top: toolbarPosition.y,
        transform: 'translateX(-50%)',
      }}
    >
      {/* Selection count */}
      <span className="px-1.5 text-xs font-medium text-muted-foreground">
        {selectedNodeIds.length}
      </span>

      <div className="h-4 w-px bg-border" />

      {/* Stack Horizontal */}
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={stackHorizontal}
        title="Stack horizontal"
      >
        <AlignHorizontalSpaceAround className="size-3.5" />
      </Button>

      {/* Stack Vertical */}
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={stackVertical}
        title="Stack vertical"
      >
        <AlignVerticalSpaceAround className="size-3.5" />
      </Button>

      {/* Grid */}
      <Button
        withWrapper={false}
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        onClick={arrangeGrid}
        title="Arrange as grid"
      >
        <Grid3X3 className="size-3.5" />
      </Button>

      {onDownloadAsZip && (
        <>
          <div className="h-4 w-px bg-border" />
          <Button
            withWrapper={false}
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            onClick={handleDownloadAsZip}
            title="Download selected nodes as ZIP"
          >
            <Download className="size-3.5" />
          </Button>
        </>
      )}

      <div className="h-4 w-px bg-border" />

      {/* Group / Ungroup */}
      {selectedGroup ? (
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleUngroup}
          title="Ungroup"
        >
          <Ungroup className="size-3.5" />
        </Button>
      ) : (
        <Button
          withWrapper={false}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={handleGroup}
          title="Group"
        >
          <Group className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

export const MultiSelectToolbar = memo(MultiSelectToolbarComponent);
