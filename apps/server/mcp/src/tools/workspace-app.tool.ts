import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getPublicAppUrl } from '@mcp/mcp/setup-page';
import type { ClientService } from '@mcp/services/client.service';
import { formatToolData } from '@mcp/shared/utils/tool-result-text.util';

export const WORKSPACE_APP_TOOL_NAMES = new Set([
  'create_task',
  'get_task',
  'list_activity',
  'list_inbox',
  'list_tasks',
]);

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
const MAX_LIMIT = 100;

/**
 * Workspace app MCP handlers: tasks, the review inbox and recent activity.
 * Each entry is a thin proxy to the live API via {@link ClientService}; org
 * scoping is enforced API-side. `create_task` only records a task.
 */
export async function handleWorkspaceAppTool(
  client: ClientService,
  name: string,
  args: Record<string, unknown>,
) {
  switch (name) {
    case 'list_tasks': {
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
    case 'list_inbox': {
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
    case 'list_activity': {
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
