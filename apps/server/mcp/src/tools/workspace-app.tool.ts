import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@genfeedai/contracts/interfaces';
import { getPublicAppUrl } from '@mcp/mcp/setup-page';
import type { WorkspaceAppClient } from '@mcp/services/client/workspace-app.client';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';
import { McpUpstreamError } from '@mcp/tools/mcp-tool-error';
import { z } from 'zod';

export const WORKSPACE_APP_TOOL_NAMES = new Set([
  'create_task',
  'get_activity',
  'get_inbox',
  'get_review_queue',
  'get_task',
  'get_tasks',
  'manage_task',
]);

const MAX_LIMIT = 100;
const nonBlankText = z.string().trim().min(1);
const taskReference = { taskId: nonBlankText };
const manageTaskSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('update'),
    input: z.strictObject({
      ...taskReference,
      assigneeUserId: nonBlankText.nullable().optional(),
      description: z.string().max(10000).optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      status: z.enum(TASK_STATUSES).optional(),
      title: nonBlankText.max(500).optional(),
    }),
  }),
  z.strictObject({
    action: z.literal('comment'),
    input: z.strictObject({ ...taskReference, body: nonBlankText }),
  }),
  z.strictObject({
    action: z.literal('complete'),
    input: z.strictObject(taskReference),
  }),
]);
const reviewQueueSchema = z.strictObject({
  brandId: nonBlankText.optional(),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  turboRunId: nonBlankText.optional(),
});

/**
 * Workspace app MCP handlers: tasks, the review inbox and recent activity.
 * Each entry is a thin proxy to the live API via {@link WorkspaceAppClient}; org
 * scoping is enforced API-side. `create_task` only records a task.
 */
export async function handleWorkspaceAppTool(
  client: WorkspaceAppClient,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'get_tasks': {
      const tasks = await client.listTasks({
        limit: readLimit(args),
        page: readPage(args),
        priority: optionalOneOf(args, 'priority', TASK_PRIORITIES),
        status: optionalOneOf(args, 'status', TASK_STATUSES),
      });
      return listResult('tasks', tasks);
    }
    case 'get_task': {
      const task = await client.getTask(requiredString(args, 'taskId'));
      return dataResult('Task', task);
    }
    case 'create_task': {
      const task = await client.createTask({
        description: optionalString(args, 'description'),
        priority: optionalOneOf(args, 'priority', TASK_PRIORITIES),
        status: optionalOneOf(args, 'status', TASK_STATUSES),
        title: requiredString(args, 'title'),
      });
      return dataResult('Task created', task);
    }
    case 'manage_task':
      return manageTask(client, manageTaskSchema.parse(args));
    case 'get_review_queue':
      return listReviewQueue(client, reviewQueueSchema.parse(args));
    case 'get_inbox': {
      const items = await client.listInbox();
      return {
        structuredContent: { data: items },
        content: [
          {
            text:
              items.length > 0
                ? `${items.length} waiting for review. Decide in the app: ${getPublicAppUrl()}${APP_ROUTES.WORKSPACE.INBOX}\n\n${formatToolData(items)}`
                : 'Nothing is waiting for review.',
            type: 'text' as const,
          },
        ],
      };
    }
    case 'get_activity': {
      const activities = await client.listActivity({
        activeOnly: args.activeOnly === true,
        limit: readLimit(args),
        page: readPage(args),
      });
      return listResult('activities', activities);
    }
    default:
      throw new Error(`Unknown Workspace tool: ${name}`);
  }
}

async function listReviewQueue(
  client: WorkspaceAppClient,
  { brandId, limit, status, turboRunId }: z.infer<typeof reviewQueueSchema>,
) {
  if (status && !turboRunId) {
    throw new Error('Supply turboRunId to filter Turbo items by status.');
  }
  const [run, inbox] = await Promise.all([
    client.getReviewRun(brandId, turboRunId).catch((error: unknown) => {
      if (
        !turboRunId &&
        error instanceof McpUpstreamError &&
        error.status === 404
      ) {
        // The Turbo module can be hidden while Publishing still shows pending approvals.
        return undefined;
      }
      throw error;
    }),
    client.listInbox(brandId),
  ]);
  const turboItems = (run?.attributes.items ?? []).filter((item) => {
    if (status) return item.status.toLowerCase() === status;
    return (
      item.status === TurboRunItemStatus.COMPLETED &&
      normalizeReviewDecision(item.reviewDecision) === ReviewDecision.UNSET
    );
  });
  const reviewItems = inbox.slice(0, limit);
  const data = {
    reviewItems,
    turboItems: turboItems.slice(0, limit),
    turboRunId: run?.id ?? null,
  };
  const reviewUrl = `${getPublicAppUrl()}${APP_ROUTES.PUBLISHING.APPROVALS}`;
  return {
    structuredContent: { data },
    content: [
      {
        text: `Found ${data.turboItems.length} Turbo items and ${reviewItems.length} pending approvals or workflow gates. Open Publishing Approvals to review them: ${reviewUrl}`,
        type: 'text' as const,
      },
    ],
  };
}

async function manageTask(
  client: WorkspaceAppClient,
  request: z.infer<typeof manageTaskSchema>,
) {
  switch (request.action) {
    case 'update': {
      const { taskId, ...patch } = request.input;
      if (Object.keys(patch).length === 0) {
        throw new Error('Specify at least one task field to update.');
      }
      return dataResult('Task updated', await client.updateTask(taskId, patch));
    }
    case 'comment': {
      const { body, taskId } = request.input;
      return dataResult(
        'Comment added',
        await client.commentOnTask(taskId, body),
      );
    }
    case 'complete':
      return dataResult(
        'Task completed',
        await client.updateTask(request.input.taskId, { status: 'done' }),
      );
  }
}

function listResult(label: string, items: Array<Record<string, unknown>>) {
  return {
    structuredContent: { data: items },
    content: [
      {
        text:
          items.length > 0
            ? `Found ${items.length} ${label}:\n\n${formatToolData(items)}`
            : `No ${label} found.`,
        type: 'text' as const,
      },
    ],
  };
}

function dataResult(label: string, data: unknown) {
  return {
    structuredContent: { data },
    content: [
      { text: `${label}:\n\n${formatToolData(data)}`, type: 'text' as const },
    ],
  };
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function optionalOneOf<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

function readLimit(args: Record<string, unknown>): number | undefined {
  const value = args.limit;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.floor(value), 1), MAX_LIMIT);
}

function readPage(args: Record<string, unknown>): number | undefined {
  const value = args.page;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(Math.floor(value), 1);
}

import {
  normalizeReviewDecision,
  ReviewDecision,
  TurboRunItemStatus,
} from '@genfeedai/contracts';
