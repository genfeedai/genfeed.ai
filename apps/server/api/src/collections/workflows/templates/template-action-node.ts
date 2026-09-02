import type { WorkflowVisualNode } from '@api/collections/workflows/schemas/workflow.schema';
import { createGenfeedActionNode } from '@genfeedai/actions';

type TemplateActionNodeInput = Omit<WorkflowVisualNode, 'type'>;

export function createTemplateActionNode(
  actionId: string,
  node: TemplateActionNodeInput,
): WorkflowVisualNode {
  const generated = createGenfeedActionNode({
    actionId,
    id: node.id,
    inputVariableKeys: node.data.inputVariableKeys,
    label: node.data.label,
    position: node.position,
  });

  return {
    ...generated,
    ...node,
    data: {
      ...generated.data,
      ...node.data,
      config: {
        actionId,
        parameters: node.data.config,
      },
    },
  };
}
