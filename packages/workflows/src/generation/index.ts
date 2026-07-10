export interface WorkflowGenerationNodeType {
  category?: string;
  description?: string;
  inputs: string[];
  outputs: string[];
  type: string;
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

export const DEFAULT_WORKFLOW_GENERATION_NODE_TYPES: WorkflowGenerationNodeType[] =
  [
    {
      category: 'input',
      description: 'Text prompt or source idea for content generation',
      inputs: [],
      outputs: ['prompt'],
      type: 'prompt',
    },
    {
      category: 'generation',
      description: 'Generate an image from a text prompt',
      inputs: ['prompt'],
      outputs: ['imageUrl'],
      type: 'image_gen',
    },
    {
      category: 'generation',
      description: 'Generate a video from a prompt or image',
      inputs: ['prompt', 'imageUrl'],
      outputs: ['videoUrl'],
      type: 'text_to_video',
    },
    {
      category: 'content',
      description: 'Generate social post copy from a prompt',
      inputs: ['prompt'],
      outputs: ['content'],
      type: 'social_post',
    },
    {
      category: 'publishing',
      description: 'Prepare generated content for review or publishing',
      inputs: ['content', 'imageUrl', 'videoUrl'],
      outputs: ['post'],
      type: 'publish_post',
    },
  ];

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
