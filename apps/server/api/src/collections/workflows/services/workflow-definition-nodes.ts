import type { WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import { createGenfeedActionNode } from '@genfeedai/actions';

/**
 * Shared node builders for system workflow definitions. Definitions lay their
 * nodes out in a single column, so only the vertical position is passed.
 */

/** A Genfeed action node at `(0, y)`. */
export function actionNode(
  actionId: string,
  id: string,
  y: number,
  inputVariableKeys: string[] = [],
  parameters: Record<string, unknown> = {},
) {
  return createGenfeedActionNode({
    actionId,
    id,
    inputVariableKeys,
    parameters,
    position: { x: 0, y },
  });
}

/** A condition node that branches on a custom boolean field being true. */
export function conditionNode(
  id: string,
  label: string,
  field: string,
  y: number,
): WorkflowVisualNode {
  return {
    data: {
      config: { customField: field, field: 'custom', operator: 'isTrue' },
      label,
    },
    id,
    position: { x: 0, y },
    type: 'condition',
  };
}

/** An action node at `(0, y)` that reads the `request` workflow variable. */
export function requestActionNode(actionId: string, id: string, y: number) {
  return actionNode(actionId, id, y, ['request']);
}
