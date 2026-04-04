import type { NodeType } from '@genfeedai/types';
import { useReactFlow } from '@xyflow/react';
import { useCallback } from 'react';
import { getLayoutedNodes } from '@/lib/autoLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { selectAddNode } from '@/store/workflow/selectors';
import { useWorkflowStore } from '@/store/workflowStore';

export function usePaneActions() {
  const addNode = useWorkflowStore(selectAddNode);
  const reactFlow = useReactFlow();

  const addNodeAtPosition = useCallback(
    (type: string, screenX: number, screenY: number) => {
      const position = reactFlow.screenToFlowPosition({ x: screenX, y: screenY });
      addNode(type as NodeType, position);
    },
    [addNode, reactFlow]
  );

  const selectAll = useCallback(() => {
    reactFlow.setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: true,
      }))
    );
  }, [reactFlow]);

  const fitView = useCallback(() => {
    reactFlow.fitView({ padding: 0.2 });
  }, [reactFlow]);

  const autoLayout = useCallback(
    (direction: 'TB' | 'LR' = 'LR') => {
      const edgeStyle = useSettingsStore.getState().edgeStyle;
      // Use React Flow's internal nodes which have measured dimensions populated
      const currentNodes = reactFlow.getNodes();
      const currentEdges = reactFlow.getEdges();
      const layoutedNodes = getLayoutedNodes(currentNodes, currentEdges, { direction });
      reactFlow.setNodes(layoutedNodes);

      // Normalize all edges to use consistent style
      reactFlow.setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          type: edgeStyle,
        }))
      );

      // Fit view after layout with a small delay to allow DOM update
      setTimeout(() => {
        reactFlow.fitView({ padding: 0.2 });
      }, 50);
    },
    [reactFlow]
  );

  return {
    addNodeAtPosition,
    autoLayout,
    fitView,
    selectAll,
  };
}
