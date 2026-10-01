import { EVENT_TYPE_TO_NODE_TYPE } from '@api/collections/workflows/services/workflow-executor.constants';
import type {
  ExecutableNode,
  ExecutableWorkflow,
} from '@genfeedai/workflows/engine';

export interface WorkflowInitialNodeSelection {
  respectLocks?: boolean;
  selectedNodeIds?: readonly string[];
}

export function findInitialWorkflowTriggerNode(
  workflow: ExecutableWorkflow,
  eventType: string,
): ExecutableNode | undefined {
  const type = EVENT_TYPE_TO_NODE_TYPE[eventType] ?? eventType;
  return workflow.nodes.find((node) => node.type === type);
}

export function prepopulateInitialWorkflowLockedNodes(
  workflow: ExecutableWorkflow,
  nodeCache: Map<string, unknown>,
  completedNodes: Set<string>,
  selection: WorkflowInitialNodeSelection = {},
): void {
  for (const node of workflow.nodes) {
    const eligible =
      selection.respectLocks !== false ||
      (selection.selectedNodeIds
        ? !selection.selectedNodeIds.includes(node.id)
        : node.type === 'workflowInput');
    if (
      eligible &&
      node.isLocked &&
      node.cachedOutput !== undefined &&
      workflow.lockedNodeIds.includes(node.id)
    ) {
      nodeCache.set(node.id, node.cachedOutput);
      completedNodes.add(node.id);
    }
  }
}

/** Fresh persisted-graph initialization only; queue caches and prior results are excluded. */
export function createInitialWorkflowNodeState(
  workflow: ExecutableWorkflow,
  trigger: { type: string; data: Record<string, unknown> },
  selection: WorkflowInitialNodeSelection = {},
): { nodeCache: Map<string, unknown>; completedNodes: Set<string> } {
  const nodeCache = new Map<string, unknown>();
  const completedNodes = new Set<string>();
  const triggerNode = findInitialWorkflowTriggerNode(workflow, trigger.type);
  if (triggerNode) {
    nodeCache.set(triggerNode.id, trigger.data);
    completedNodes.add(triggerNode.id);
  }
  prepopulateInitialWorkflowLockedNodes(
    workflow,
    nodeCache,
    completedNodes,
    selection,
  );
  return { nodeCache, completedNodes };
}
