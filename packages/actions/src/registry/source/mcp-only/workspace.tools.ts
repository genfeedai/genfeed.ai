import type { SourceTool } from '../../../interfaces/source-tool.interface';

const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'failed',
  'cancelled',
] as const;

const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * Workspace app MCP surface: tasks, the review inbox, and recent activity.
 *
 * Thin passthroughs to the live `tasks`, `review-inbox` and `activities` APIs
 * (no business logic in the MCP layer). Review decisions stay in the app and
 * `resolve_approval`; this surface only lists what is waiting.
 */
export const MCP_WORKSPACE_TOOLS: SourceTool[] = [
  {
    creditCost: 0,
    description:
      'List workspace tasks, newest first. Filter by status or priority. Returns title, status, priority and assignee for each task.',
    name: 'list_tasks',
    parameters: {
      additionalProperties: false,
      properties: {
        limit: {
          default: 10,
          description: 'Tasks to return (1-100)',
          maximum: 100,
          minimum: 1,
          type: 'number',
        },
        page: {
          default: 1,
          description: 'Page number, starting at 1',
          minimum: 1,
          type: 'number',
        },
        priority: {
          description: 'Only tasks with this priority',
          enum: [...TASK_PRIORITIES],
          type: 'string',
        },
        status: {
          description: 'Only tasks with this status',
          enum: [...TASK_STATUSES],
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
      'Get one workspace task by id: description, status, priority, assignee, outputs and linked content.',
    name: 'get_task',
    parameters: {
      additionalProperties: false,
      properties: {
        taskId: { description: 'Task id', minLength: 1, type: 'string' },
      },
      required: ['taskId'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'Create a workspace task. Only records the task; it does not start work, generate, or publish.',
    name: 'create_task',
    parameters: {
      additionalProperties: false,
      properties: {
        description: {
          description: 'Detailed description (up to 10,000 characters)',
          maxLength: 10000,
          type: 'string',
        },
        priority: {
          description: 'Task priority',
          enum: [...TASK_PRIORITIES],
          type: 'string',
        },
        status: {
          description: 'Initial status (the workspace default when omitted)',
          enum: [...TASK_STATUSES],
          type: 'string',
        },
        title: {
          description: 'Task title (up to 500 characters)',
          maxLength: 500,
          minLength: 1,
          type: 'string',
        },
      },
      required: ['title'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List what is waiting for review in the workspace inbox: workflow review gates and queued MCP approvals. Read-only; decisions are made in the app.',
    name: 'list_inbox',
    parameters: {
      additionalProperties: false,
      properties: {},
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List recent account activity, newest first: generations, publishing and credit events. Set activeOnly to see only work still processing.',
    name: 'list_activity',
    parameters: {
      additionalProperties: false,
      properties: {
        activeOnly: {
          default: false,
          description: 'Only activity for work that is still processing',
          type: 'boolean',
        },
        limit: {
          default: 10,
          description: 'Activities to return (1-100)',
          maximum: 100,
          minimum: 1,
          type: 'number',
        },
        page: {
          default: 1,
          description: 'Page number, starting at 1',
          minimum: 1,
          type: 'number',
        },
      },
      type: 'object',
    },
    requiredRole: 'user',
  },
];
