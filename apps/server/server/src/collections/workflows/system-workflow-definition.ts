import {
  createGenfeedActionNode,
  getActionDefinition,
} from '@genfeedai/actions';
import type { WorkflowExecutionTrigger } from '@genfeedai/enums';
import type { WorkflowDefinitionInput } from '@server/collections/workflows/workflow-version-definition';

export type SystemWorkflowGraphMetadata = {
  canonicalId: string;
  changeSummary?: string;
  description: string;
  label: string;
  schedule?: string;
  version?: number;
};

export type SystemWorkflowGraphDefinition = SystemWorkflowGraphMetadata & {
  definition: WorkflowDefinitionInput;
  resultNodeId: string;
};

export type RunSystemWorkflowInput = {
  actionType: string;
  canonicalId: string;
  inputValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  organizationId: string;
  postIds?: string[];
  source: string;
  trigger?: WorkflowExecutionTrigger;
  userId?: string;
  runtimeContext?: unknown;
};

export function createSystemActionWorkflowDefinition(
  actionId: string,
): SystemWorkflowGraphDefinition {
  const actionDefinition = getActionDefinition(actionId);
  if (!actionDefinition) {
    throw new Error(`Unknown Genfeed action: ${actionId}`);
  }

  return {
    canonicalId: actionDefinition.id,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'payload',
          label: 'Action input',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: actionDefinition.id,
          id: 'system-action',
          inputVariableKeys: ['payload'],
        }),
      ],
    },
    description: actionDefinition.description,
    label: actionDefinition.label,
    resultNodeId: 'system-action',
  };
}
