import type { SourceTool } from '../../interfaces/source-tool.interface';
import { JSON_OBJECT_SCHEMA } from '../contracts/schema-builders';
import {
  WORKFLOW_EDGE_SCHEMA,
  WORKFLOW_INPUT_VARIABLE_SCHEMA,
  WORKFLOW_NODE_SCHEMA,
} from './schemas/workflow-input.schemas';

export const OVERLAP_WORKFLOW_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Create a workflow: direct graph, a recurring scaffold, or natural-language generation. Editable in the Workflows app.',
    name: 'create_workflow',
    parameters: {
      properties: {
        aspectRatio: {
          description: 'Aspect ratio for recurring assets.',
          enum: ['1:1', '4:5', '9:16', '16:9'],
          type: 'string',
        },
        brandId: {
          description: 'Brand ID; defaults to the selected brand.',
          type: 'string',
        },
        contentType: {
          description: 'Content type for the recurring scaffold.',
          enum: ['image', 'video', 'post', 'newsletter'],
          type: 'string',
        },
        count: {
          description: 'Assets to generate per scheduled run.',
          type: 'number',
        },
        description: {
          description: 'Natural-language description.',
          type: 'string',
        },
        diversityMode: {
          description: 'Variation level for recurring assets.',
          enum: ['low', 'medium', 'high'],
          type: 'string',
        },
        edges: {
          items: WORKFLOW_EDGE_SCHEMA,
          type: 'array',
        },
        inputVariables: {
          description: 'Input variable definitions.',
          items: WORKFLOW_INPUT_VARIABLE_SCHEMA,
          type: 'array',
        },
        isScheduleEnabled: {
          type: 'boolean',
        },
        label: {
          description: 'Label shown in the Workflows app.',
          type: 'string',
        },
        metadata: {
          ...JSON_OBJECT_SCHEMA,
        },
        model: {
          description: 'Model override for recurring flows.',
          type: 'string',
        },
        negativePrompt: {
          description: 'What recurring generations should avoid.',
          type: 'string',
        },
        nodes: {
          items: WORKFLOW_NODE_SCHEMA,
          type: 'array',
        },
        prompt: {
          description: 'Recurring generation brief (with schedule).',
          type: 'string',
        },
        schedule: {
          description: 'Cron expression for recurrence.',
          type: 'string',
        },
        sourceAssetId: {
          description: 'Source asset ID for the brief.',
          type: 'string',
        },
        styleNotes: {
          description: 'Creative direction or brand guardrails.',
          type: 'string',
        },
        targetPlatforms: {
          description: 'Platform hints for generation.',
          items: { type: 'string' },
          type: 'array',
        },
        templateId: {
          type: 'string',
        },
        timezone: {
          description: 'Schedule timezone.',
          type: 'string',
        },
        trigger: {
          type: 'string',
        },
      },
      required: ['label'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Execute an existing workflow immediately. Select nodeIds to rerun edited steps while reusing locked outputs; pass required variables for full or partial execution.',
    name: 'execute_workflow',
    parameters: {
      properties: {
        nodeIds: {
          description:
            'Nonempty list of node IDs to rerun. Include affected downstream steps; unavailable dependencies fail explicitly.',
          items: { minLength: 1, type: 'string' },
          minItems: 1,
          uniqueItems: true,
          type: 'array',
        },
        respectLocks: {
          default: true,
          description:
            'Reuse locked outputs by default; set false to regenerate selected locked nodes.',
          type: 'boolean',
        },
        variables: {
          description:
            'Variables to pass to the workflow (e.g., topic, style, platforms)',
          ...JSON_OBJECT_SCHEMA,
        },
        workflowId: {
          description: 'ID of the workflow to execute',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
