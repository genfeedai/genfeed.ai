import { getActionDefinition } from '@genfeedai/actions';
import type { NodeType } from '@genfeedai/contracts/types';
import { useReactFlow, type XYPosition } from '@xyflow/react';
import { useCallback } from 'react';
import type { WorkflowNodeTransferPayload } from '../lib/paletteTransfer';
import { useWorkflowUIConfig } from '../provider/WorkflowUIProvider';
import { useWorkflowStore } from '../stores/workflow';
import { selectAddNode } from '../stores/workflow/selectors';

export type CatalogNodeEntry = Pick<
  WorkflowNodeTransferPayload,
  'actionId' | 'label' | 'type'
>;

/** Centre of the canvas pane in flow coordinates, or the window centre. */
function useCanvasCentre() {
  const reactFlow = useReactFlow();

  return useCallback((): XYPosition => {
    const pane = document.querySelector('.react-flow')?.getBoundingClientRect();
    const screenPosition = pane
      ? { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    return reactFlow.screenToFlowPosition(screenPosition);
  }, [reactFlow]);
}

/**
 * Adds a catalog entry (an engine primitive or a `genfeedAction`) to the
 * canvas. Shared by the drag-and-drop path and the Add node menu so both
 * apply the same action validation and parameter defaults.
 */
export function useAddCatalogNode() {
  const addNode = useWorkflowStore(selectAddNode);
  const { actionParameterDefaults } = useWorkflowUIConfig();
  const getCanvasCentre = useCanvasCentre();

  return useCallback(
    (entry: CatalogNodeEntry, position?: XYPosition): string | null => {
      if (entry.type === 'genfeedAction') {
        const action = entry.actionId
          ? getActionDefinition(entry.actionId)
          : undefined;
        if (action?.visibility !== 'workflow') return null;
      }

      const nodeId = addNode(
        entry.type as NodeType,
        position ?? getCanvasCentre(),
      );
      if (!nodeId) return null;

      if (entry.actionId) {
        useWorkflowStore.getState().updateNodeData(nodeId, {
          actionId: entry.actionId,
          label: entry.label,
          parameters: actionParameterDefaults?.(entry.actionId) ?? {},
        });
      }

      return nodeId;
    },
    [actionParameterDefaults, addNode, getCanvasCentre],
  );
}
