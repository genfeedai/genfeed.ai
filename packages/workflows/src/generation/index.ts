import { ALL_ACTIONS } from '@genfeedai/actions';
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

export interface GeneratedWorkflowShape {
  description: string;
  edges: Array<{
    id: string;
    source: string;
    sourceHandle: string;
    target: string;
    targetHandle: string;
  }>;
  name: string;
  nodes: Array<{
    data: Record<string, unknown>;
    id: string;
    position: { x: number; y: number };
    type: string;
  }>;
}

export interface ParsedWorkflowGeneration {
  workflow: Record<string, unknown>;
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
    'Output a JSON object with this structure:',
    '{',
    '  "name": "string - workflow name",',
    '  "description": "string - workflow description",',
    '  "nodes": [{ "id": "string", "type": "string (from available types)", "position": { "x": number, "y": number }, "data": { "label": "string", "config": {} } }],',
    '  "edges": [{ "id": "string", "source": "node-id", "target": "node-id", "sourceHandle": "output-key", "targetHandle": "input-key" }]',
    '}',
    '',
    'Rules:',
    '- Only use node types from the available list above.',
    '- For an entry with workflowActionId, set node.type to "genfeedAction" and data.config to { "actionId": workflowActionId, "parameters": { ...action parameters } }.',
    '- Connect nodes via edges using valid input/output handles.',
    '- Position nodes in a left-to-right flow with ~250px horizontal spacing.',
    '- Return ONLY the JSON object, no markdown fences or explanation.',
    platformConstraint,
  ].join('\n');

  return [
    { content: systemPrompt, role: 'system' },
    { content: description, role: 'user' },
  ];
}

export function parseWorkflowGenerationResponse(
  raw: string,
): ParsedWorkflowGeneration {
  const workflow = JSON.parse(raw || '{}') as Record<string, unknown>;

  return { workflow };
}
