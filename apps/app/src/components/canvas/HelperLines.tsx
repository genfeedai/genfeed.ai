'use client';

import { useStore as useReactFlowStore } from '@xyflow/react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';

// Threshold for snapping (in pixels at zoom level 1)
const SNAP_THRESHOLD = 5;

interface HelperLine {
  type: 'horizontal' | 'vertical';
  position: number; // X for vertical, Y for horizontal
  start: number; // Start position (Y for vertical, X for horizontal)
  end: number; // End position
}

interface HelperLinesProps {
  draggingNodeId: string | null;
}

function HelperLinesComponent({ draggingNodeId }: HelperLinesProps) {
  const [lines, setLines] = useState<HelperLine[]>([]);
  const nodes = useWorkflowStore((state) => state.nodes);
  const transform = useReactFlowStore((state) => state.transform);

  // Calculate helper lines when a node is being dragged
  const calculateHelperLines = useCallback(
    (draggingId: string) => {
      const draggingNode = nodes.find((n) => n.id === draggingId);
      if (!draggingNode) {
        setLines([]);
        return;
      }

      const otherNodes = nodes.filter((n) => n.id !== draggingId && !n.selected);
      if (otherNodes.length === 0) {
        setLines([]);
        return;
      }

      // Get dragging node bounds (using default size if not available)
      const dragWidth = draggingNode.measured?.width ?? draggingNode.width ?? 220;
      const dragHeight = draggingNode.measured?.height ?? draggingNode.height ?? 100;
      const dragLeft = draggingNode.position.x;
      const dragRight = dragLeft + dragWidth;
      const dragTop = draggingNode.position.y;
      const dragBottom = dragTop + dragHeight;
      const dragCenterX = dragLeft + dragWidth / 2;
      const dragCenterY = dragTop + dragHeight / 2;

      const newLines: HelperLine[] = [];

      for (const node of otherNodes) {
        const nodeWidth = node.measured?.width ?? node.width ?? 220;
        const nodeHeight = node.measured?.height ?? node.height ?? 100;
        const nodeLeft = node.position.x;
        const nodeRight = nodeLeft + nodeWidth;
        const nodeTop = node.position.y;
        const nodeBottom = nodeTop + nodeHeight;
        const nodeCenterX = nodeLeft + nodeWidth / 2;
        const nodeCenterY = nodeTop + nodeHeight / 2;

        // Check vertical alignments (X positions)
        const verticalChecks = [
          { dragPos: dragLeft, label: 'left-left', nodePos: nodeLeft },
          { dragPos: dragLeft, label: 'left-right', nodePos: nodeRight },
          { dragPos: dragRight, label: 'right-left', nodePos: nodeLeft },
          { dragPos: dragRight, label: 'right-right', nodePos: nodeRight },
          { dragPos: dragCenterX, label: 'center-center-x', nodePos: nodeCenterX },
        ];

        for (const check of verticalChecks) {
          if (Math.abs(check.dragPos - check.nodePos) <= SNAP_THRESHOLD) {
            newLines.push({
              end: Math.max(dragBottom, nodeBottom) + 20,
              position: check.nodePos,
              start: Math.min(dragTop, nodeTop) - 20,
              type: 'vertical',
            });
          }
        }

        // Check horizontal alignments (Y positions)
        const horizontalChecks = [
          { dragPos: dragTop, label: 'top-top', nodePos: nodeTop },
          { dragPos: dragTop, label: 'top-bottom', nodePos: nodeBottom },
          { dragPos: dragBottom, label: 'bottom-top', nodePos: nodeTop },
          { dragPos: dragBottom, label: 'bottom-bottom', nodePos: nodeBottom },
          { dragPos: dragCenterY, label: 'center-center-y', nodePos: nodeCenterY },
        ];

        for (const check of horizontalChecks) {
          if (Math.abs(check.dragPos - check.nodePos) <= SNAP_THRESHOLD) {
            newLines.push({
              end: Math.max(dragRight, nodeRight) + 20,
              position: check.nodePos,
              start: Math.min(dragLeft, nodeLeft) - 20,
              type: 'horizontal',
            });
          }
        }
      }

      // Deduplicate lines by position (keep unique lines)
      const uniqueLines: HelperLine[] = [];
      const seenPositions = new Set<string>();

      for (const line of newLines) {
        const key = `${line.type}-${Math.round(line.position)}`;
        if (!seenPositions.has(key)) {
          seenPositions.add(key);
          // Extend line to cover all matching nodes
          const existingLine = uniqueLines.find(
            (l) => l.type === line.type && Math.abs(l.position - line.position) < 1
          );
          if (existingLine) {
            existingLine.start = Math.min(existingLine.start, line.start);
            existingLine.end = Math.max(existingLine.end, line.end);
          } else {
            uniqueLines.push(line);
          }
        }
      }

      setLines(uniqueLines);
    },
    [nodes]
  );

  // Update helper lines when dragging node changes position
  useEffect(() => {
    if (draggingNodeId) {
      calculateHelperLines(draggingNodeId);
    } else {
      setLines([]);
    }
  }, [draggingNodeId, calculateHelperLines]);

  if (lines.length === 0) return null;

  // Transform from flow coordinates to screen coordinates
  const [tx, ty, zoom] = transform;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-[1000]"
      style={{ height: '100%', overflow: 'visible', width: '100%' }}
    >
      {lines.map((line, index) => {
        if (line.type === 'vertical') {
          // Vertical line (constant X)
          const x = line.position * zoom + tx;
          const y1 = line.start * zoom + ty;
          const y2 = line.end * zoom + ty;
          return (
            <line
              key={`v-${index}`}
              x1={x}
              y1={y1}
              x2={x}
              y2={y2}
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
          );
        } else {
          // Horizontal line (constant Y)
          const y = line.position * zoom + ty;
          const x1 = line.start * zoom + tx;
          const x2 = line.end * zoom + tx;
          return (
            <line
              key={`h-${index}`}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="4 2"
            />
          );
        }
      })}
    </svg>
  );
}

export const HelperLines = memo(HelperLinesComponent);
