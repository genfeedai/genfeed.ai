import type { NodeType } from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import { tool } from 'ai';
import { z } from 'zod';
import type { WorkflowContext } from './contextBuilder';
import { formatContextForPrompt } from './contextBuilder';
import type { SubgraphResult } from './subgraphExtractor';

/**
 * Valid node types for workflow editing, derived from NODE_DEFINITIONS.
 */
const VALID_NODE_TYPES: NodeType[] = Object.keys(NODE_DEFINITIONS) as NodeType[];

/**
 * Generates a description of editable properties per node type from NODE_DEFINITIONS.
 */
function getEditablePropertiesDescription(): string {
  const lines: string[] = [];

  // Common properties
  lines.push('- **Any node**: `{ "label": "New Name" }`');

  // Input nodes
  lines.push('- **prompt** node: `{ "prompt": "the text" }`');
  lines.push('- **promptConstructor** node: `{ "template": "Use @var1 with @var2" }`');

  // AI nodes with key configs
  lines.push(
    '- **imageGen** node: `{ "model": "nano-banana"|"nano-banana-pro", "aspectRatio": "1:1"|"16:9"|..., "resolution": "1K"|"2K"|"4K" }`'
  );
  lines.push(
    '- **videoGen** node: `{ "model": "veo-3.1-fast"|..., "duration": 4-16, "aspectRatio": "16:9"|... }`'
  );
  lines.push(
    '- **llm** node: `{ "systemPrompt": "...", "temperature": 0-2, "maxTokens": 256-16384 }`'
  );

  return lines.join('\n');
}

/**
 * Builds the enhanced system prompt with current workflow context and tool usage rules.
 */
export function buildEditSystemPrompt(
  workflowContext: WorkflowContext,
  restSummary?: SubgraphResult['restSummary']
): string {
  const baseDomainExpertise = `You are a workflow expert for Genfeed, a visual node-based AI content creation tool. Be concise and direct — short bullet points, no fluff.

## Node Types Available

${VALID_NODE_TYPES.map((type) => {
  const def = NODE_DEFINITIONS[type];
  return `- **${def.label}** (\`${type}\`): ${def.description}`;
}).join('\n')}

## How Workflows Work
- Nodes are placed on a canvas and connected by dragging between handles (colored dots)
- Image handles connect to image handles, text handles to text handles, etc.
- Workflows run left-to-right: input → processing → output
- Each node can have multiple inputs and outputs as defined by its type`;

  let contextSection = `

## CURRENT WORKFLOW

${formatContextForPrompt(workflowContext)}`;

  if (restSummary && restSummary.nodeCount > 0) {
    const typeBreakdown = Object.entries(restSummary.typeBreakdown)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');

    const boundaryInfo =
      restSummary.boundaryConnections.length > 0
        ? `\nConnections to selected nodes: ${restSummary.boundaryConnections.map((bc) => `${bc.direction === 'incoming' ? 'Input from' : 'Output to'} ${bc.otherNodeId} (${bc.handleType})`).join(', ')}`
        : '';

    contextSection += `

## WORKFLOW CONTEXT (SELECTED SUBSET)

You are focused on the selected nodes. The rest of the workflow:
- ${restSummary.nodeCount} other node(s): ${typeBreakdown}${boundaryInfo}`;
  }

  const toolUsageRules = `

## TOOL USAGE RULES

- Use **answerQuestion** when the user asks HOW to do something or WHAT something is. Never modify the workflow.
- Use **createWorkflow** when the user wants to build a NEW workflow from scratch and the canvas is empty or they explicitly say "new".
- Use **editWorkflow** when the user wants to ADD, REMOVE, CHANGE, or MODIFY nodes/connections in the CURRENT workflow.
- Always explain what you're about to do BEFORE calling a tool.
- When editing, reference nodes by their ID from the current workflow state.
- After editing, summarize what changed.

## EDITABLE NODE PROPERTIES

${getEditablePropertiesDescription()}

Do NOT use guessed property names. Use ONLY the exact names from the node data interfaces.`;

  return baseDomainExpertise + contextSection + toolUsageRules;
}

/**
 * Creates the tool definitions for the chat agent.
 * Uses the AI SDK tool calling pattern with zod schemas.
 */
export function createChatTools(_nodeIds: string[]) {
  return {
    answerQuestion: tool({
      description:
        'Answer questions about how to use Genfeed. Use this for informational questions. Does NOT modify the workflow.',
      execute: async ({ answer }) => ({ answer }),
      inputSchema: z.object({
        answer: z.string().describe('The helpful answer to the user question'),
      }),
    }),

    createWorkflow: tool({
      description:
        'Create a brand new workflow from scratch based on user description. Use when user wants to start fresh or build something new.',
      execute: async ({ description }) => ({ description }),
      inputSchema: z.object({
        description: z.string().describe('Description of what the workflow should do'),
      }),
    }),

    editWorkflow: tool({
      description:
        'Make targeted edits to the current workflow. Use when user wants to add, remove, or modify nodes and connections. Reference nodes by their ID.',
      execute: async ({ operations, explanation }) => ({ explanation, operations }),
      inputSchema: z.object({
        explanation: z
          .string()
          .describe('Brief explanation of what changes are being made and why'),
        operations: z
          .array(
            z.object({
              data: z
                .record(z.string(), z.unknown())
                .optional()
                .describe('Node data to set/merge for addNode/updateNode'),
              edgeId: z.string().optional().describe('Edge ID for removeEdge'),
              nodeId: z.string().optional().describe('Target node ID for removeNode/updateNode'),
              nodeType: z
                .string()
                .optional()
                .describe(`Node type for addNode. Valid: ${VALID_NODE_TYPES.join(', ')}`),
              position: z
                .object({ x: z.number(), y: z.number() })
                .optional()
                .describe('Position for addNode'),
              source: z.string().optional().describe('Source node ID for addEdge'),
              sourceHandle: z.string().optional().describe('Source handle type for addEdge'),
              target: z.string().optional().describe('Target node ID for addEdge'),
              targetHandle: z.string().optional().describe('Target handle type for addEdge'),
              type: z.enum(['addNode', 'removeNode', 'updateNode', 'addEdge', 'removeEdge']),
            })
          )
          .describe('List of edit operations to apply'),
      }),
    }),
  };
}
