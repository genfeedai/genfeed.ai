import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import type { CuratedActionName } from '@genfeedai/actions';
import {
  createGenfeedActionNode,
  getToolsForSurface,
} from '@genfeedai/actions';

export function agentToolWorkflowId(toolName: CuratedActionName): string {
  return `agent.tool.${toolName}`;
}

export function buildAgentToolWorkflowDefinition(
  toolName: CuratedActionName,
): SystemWorkflowGraphDefinition {
  const canonicalId = agentToolWorkflowId(toolName);
  return {
    canonicalId,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'parameters',
          label: 'Agent tool parameters',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: toolName,
          id: 'execute-tool',
          inputVariableKeys: ['parameters'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: `Executes the registered ${toolName} action for an Agent workflow.`,
    label: `Agent Tool: ${toolName}`,
    resultNodeId: 'execute-tool',
    version: 1,
  };
}

export const AGENT_TOOL_WORKFLOW_DEFINITIONS = getToolsForSurface('agent').map(
  (tool) => buildAgentToolWorkflowDefinition(tool.name),
) satisfies SystemWorkflowGraphDefinition[];

export function findAgentToolWorkflowDefinition(
  toolName: CuratedActionName,
): SystemWorkflowGraphDefinition {
  const canonicalId = agentToolWorkflowId(toolName);
  const definition = AGENT_TOOL_WORKFLOW_DEFINITIONS.find(
    (candidate) => candidate.canonicalId === canonicalId,
  );
  if (!definition) {
    throw new Error(`Agent tool is not workflow-enabled: ${toolName}`);
  }
  return definition;
}
