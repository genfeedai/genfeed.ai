import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode, getToolByName } from '@genfeedai/actions';
import { AgentToolName } from '@genfeedai/interfaces';

export function agentToolWorkflowId(toolName: AgentToolName): string {
  return `agent.tool.${toolName}`;
}

export function buildAgentToolWorkflowDefinition(
  toolName: AgentToolName,
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

export const AGENT_TOOL_WORKFLOW_DEFINITIONS = Object.values(
  AgentToolName,
).flatMap((toolName) => {
  const tool = getToolByName(toolName);
  return tool && (tool.surfaces.agent || tool.surfaces.mcp)
    ? [buildAgentToolWorkflowDefinition(toolName)]
    : [];
}) satisfies SystemWorkflowGraphDefinition[];

export function findAgentToolWorkflowDefinition(
  toolName: AgentToolName,
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
