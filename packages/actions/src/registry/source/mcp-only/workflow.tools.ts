import type { SourceTool } from '../../../interfaces/source-tool.interface.js';

export const MCP_WORKFLOW_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Get the current status and progress of a workflow, including step completion details.',
    name: 'get_workflow_status',
    parameters: {
      properties: {
        workflowId: {
          description: 'ID of the workflow to check',
          type: 'string',
        },
      },
      required: ['workflowId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List available workflow templates that can be used to quickly create new workflows.',
    name: 'list_workflow_templates',
    parameters: {
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
  },
];
