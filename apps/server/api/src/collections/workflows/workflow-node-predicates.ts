import type { WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';

export function isWorkflowInputNodeType(nodeType: string | undefined): boolean {
  return nodeType === 'workflowInput';
}

export function isWorkflowOutputNode(node: WorkflowVisualNode): boolean {
  return (
    node.type === 'genfeedAction' &&
    node.data?.config?.actionId === 'workflow.collect-output'
  );
}
