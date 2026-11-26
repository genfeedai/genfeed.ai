import {
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@genfeedai/contracts/interfaces';
import type { SourceTool } from '../../../interfaces/source-tool.interface';

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
      "Approval card buttons only; never call this yourself. Records the person's Approve or Decline click on an approval card. It does nothing without the proof only the card holds.",
    name: 'answer_approval',
    parameters: {
      additionalProperties: false,
      properties: {
        approvalId: {
          description: 'The approval the card shows',
          type: 'string',
        },
        cardProof: {
          description: 'The proof the card holds for this approval',
          type: 'string',
        },
        decision: {
          description: 'The button the person pressed',
          enum: ['approve', 'decline'],
          type: 'string',
        },
      },
      required: ['approvalId', 'decision', 'cardProof'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List workspace tasks, newest first. Filter by status or priority. Returns title, status, priority and assignee for each task.',
    name: 'get_tasks',
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
      'Manage an existing workspace task. Use update to change title, description, priority, status, or assigneeUserId, comment to add a Markdown body, or complete to mark the task done through its normal status transition. Task review decisions remain in the app.',
    name: 'manage_task',
    parameters: {
      additionalProperties: false,
      properties: {
        action: { type: 'string', enum: ['update', 'comment', 'complete'] },
        input: {
          additionalProperties: false,
          properties: {
            taskId: {
              description: 'Existing task ID',
              minLength: 1,
              type: 'string',
            },
            title: {
              description: 'Update only. Task title',
              minLength: 1,
              maxLength: 500,
              type: 'string',
            },
            description: {
              description: 'Update only. Task description',
              maxLength: 10000,
              type: 'string',
            },
            priority: {
              description: 'Update only. Task priority',
              enum: [...TASK_PRIORITIES],
              type: 'string',
            },
            status: {
              description: 'Update only. Task status',
              enum: [...TASK_STATUSES],
              type: 'string',
            },
            assigneeUserId: {
              description:
                'Update only. Canonical workspace teammate user ID, or null to unassign',
              type: ['string', 'null'],
            },
            body: {
              description: 'Comment only. Required Markdown comment body',
              minLength: 1,
              type: 'string',
            },
          },
          required: ['taskId'],
          type: 'object',
        },
      },
      required: ['action', 'input'],
      type: 'object',
    },
    requiredRole: 'user',
  },
  {
    creditCost: 0,
    description:
      'List what is waiting for review in the workspace inbox: workflow review gates, queued MCP approvals and questions an agent run waits on. Read-only; decisions and answers are made in the app.',
    name: 'get_inbox',
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
    name: 'get_activity',
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
