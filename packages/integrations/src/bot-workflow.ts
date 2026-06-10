import type { WorkflowInput } from './types';

/**
 * Shared workflow-related types used by all channel bot managers
 * (Discord, Slack, Telegram).
 *
 * These were previously copy-pasted into each bot manager service.
 * The runtime shape matches the internal /v1/orgs/:orgId/workflows response.
 */

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  nodes?: Record<string, WorkflowNode>;
}

export interface WorkflowNode {
  type: string;
  data?: {
    label?: string;
    inputType?: 'text' | 'image';
    defaultValue?: string;
    required?: boolean;
  };
}

/**
 * Extract the ordered list of user-facing inputs from a workflow definition.
 * Iterates the `nodes` map and returns every node whose `type` is `"input"`.
 */
export function extractWorkflowInputs(
  workflow: WorkflowDefinition,
): WorkflowInput[] {
  const inputs: WorkflowInput[] = [];

  if (!workflow.nodes) {
    return inputs;
  }

  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    if (node.type === 'input' && node.data) {
      inputs.push({
        defaultValue: node.data.defaultValue,
        inputType: node.data.inputType || 'text',
        label: node.data.label || nodeId,
        nodeId,
        required: node.data.required !== false,
      });
    }
  }

  return inputs;
}
