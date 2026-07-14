import type { SourceTool } from '../../interfaces/source-tool.interface.js';

export const WORKFLOW_CONTROL_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'Inspect one workflow, including schedule, lifecycle, inputs, graph summary, and immutable system-workflow metadata when present.',
    name: 'inspect_workflow',
    parameters: {
      properties: {
        workflowId: {
          description: 'ID of the workflow to inspect',
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
      'Duplicate a workflow into the current organization and brand scope so the copy can be edited or scheduled without mutating the source workflow.',
    name: 'duplicate_workflow',
    parameters: {
      properties: {
        workflowId: {
          description: 'ID of the workflow to duplicate',
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
      'Enable, disable, or update the schedule on an editable workflow duplicate. Disabling requires no new cron expression when the workflow already has one.',
    name: 'set_workflow_schedule',
    parameters: {
      properties: {
        enabled: {
          description: 'Whether the workflow schedule should be enabled',
          type: 'boolean',
        },
        schedule: {
          description:
            'Cron expression to apply. Required when enabling and optional when disabling an already scheduled workflow.',
          type: 'string',
        },
        timezone: {
          description: 'IANA timezone for the schedule. Defaults to UTC.',
          type: 'string',
        },
        workflowId: {
          description: 'ID of the workflow whose schedule should be updated',
          type: 'string',
        },
      },
      required: ['workflowId', 'enabled'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List workflow run history with optional workflow, status, trigger, limit, and offset filters.',
    name: 'list_workflow_runs',
    parameters: {
      properties: {
        limit: {
          default: 20,
          description: 'Maximum number of workflow runs to return',
          type: 'number',
        },
        offset: {
          default: 0,
          description: 'Number of workflow runs to skip',
          type: 'number',
        },
        status: {
          description: 'Optional workflow run status filter',
          type: 'string',
        },
        trigger: {
          description: 'Optional workflow run trigger filter',
          type: 'string',
        },
        workflowId: {
          description: 'Optional workflow ID to scope the run history',
          type: 'string',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Inspect a single workflow run, including status, trigger, node results, progress, timing, errors, and metadata.',
    name: 'get_workflow_run',
    parameters: {
      properties: {
        runId: {
          description: 'Workflow execution/run ID to inspect',
          type: 'string',
        },
      },
      required: ['runId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
];
