import { ALL_ACTIONS } from '@genfeedai/actions';
import {
  WORKFLOW_GENERATION_SCHEMA_NAME,
  type WorkflowGeneration,
  workflowGenerationSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { ENGINE_NATIVE_NODE_TYPES } from '../engine/utils/action-node';
import { getNodeDefinition } from '../nodes/registry/merged-registry';

export interface WorkflowGenerationNodeType {
  category?: string;
  description?: string;
  inputs: string[];
  outputs: string[];
  type: string;
  workflowActionId?: string;
}

export interface BuildWorkflowGenerationPromptParams {
  availableNodeTypes: WorkflowGenerationNodeType[];
  description: string;
  targetPlatforms?: string[];
}

export function buildWorkflowGenerationNodeTypes(): WorkflowGenerationNodeType[] {
  const engineNative: WorkflowGenerationNodeType[] = [];
  for (const type of ENGINE_NATIVE_NODE_TYPES) {
    const definition = getNodeDefinition(type);
    if (!definition) {
      continue;
    }
    engineNative.push({
      category: definition.category,
      description: definition.description,
      inputs: definition.inputs.map((input) => input.id),
      outputs: definition.outputs.map((output) => output.id),
      type,
    });
  }

  const actions = ALL_ACTIONS.filter(
    (action) => action.visibility === 'workflow',
  ).map((action) => {
    const definition = getNodeDefinition(action.id);
    return {
      category: action.workflowCategory ?? definition?.category,
      description: action.description,
      inputs: (definition?.inputs ?? []).map((input) => input.id),
      outputs: (definition?.outputs ?? []).map((output) => output.id),
      type: 'genfeedAction',
      workflowActionId: action.id,
    };
  });

  return [...engineNative, ...actions];
}

export function buildWorkflowGenerationMessages({
  availableNodeTypes,
  description,
  targetPlatforms,
}: BuildWorkflowGenerationPromptParams): Array<{
  content: string;
  role: 'system' | 'user';
}> {
  const platformConstraint = targetPlatforms?.length
    ? `The workflow should target these platforms: ${targetPlatforms.join(', ')}.`
    : '';

  const systemPrompt = [
    'You are a workflow generator for a visual content creation platform.',
    'Given a natural language description, generate a valid workflow JSON.',
    '',
    'Available node types:',
    JSON.stringify(availableNodeTypes, null, 2),
    '',
    'Rules:',
    '- Only use node types from the available list above.',
    '- For an entry with workflowActionId, set node.type to "genfeedAction" and data.config to { "actionId": workflowActionId, "parameters": { ...action parameters } }.',
    '- Give each node a data.label.',
    '- Connect nodes via edges using valid input/output handles.',
    '- Position nodes in a left-to-right flow with ~250px horizontal spacing.',
    platformConstraint,
  ].join('\n');

  return [
    { content: systemPrompt, role: 'system' },
    { content: description, role: 'user' },
  ];
}

/**
 * Validate a graph from a provider that cannot be told to answer in JSON.
 *
 * The prompt no longer forbids markdown fences — an enforcing route has no
 * need of that instruction — so a local provider may well wrap its answer in
 * one. That fence is transport, not content: unwrapping it keeps the payload
 * intact so the schema, rather than a regex, decides whether the graph is
 * usable. Enforcing routes never call this.
 */
export function parseUnenforcedWorkflowGeneration(
  raw: string,
): WorkflowGeneration {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/i);

  return workflowGenerationSchema.parse(
    JSON.parse(fenced?.[1]?.trim() ?? trimmed),
  );
}

export type { WorkflowGeneration };
/**
 * The generated graph's schema, re-exported beside the prompt builder so a
 * caller never has to keep the two in step by hand. Routes that can enforce a
 * JSON Schema hand this to the provider; routes that cannot go through
 * {@link parseUnenforcedWorkflowGeneration} instead.
 */
export { WORKFLOW_GENERATION_SCHEMA_NAME, workflowGenerationSchema };
