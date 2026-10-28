import type {
  AgentTask,
  AgentTaskStatus,
} from '../interfaces/ai/agent-task-list.interface';

export const AGENT_TASK_STATUSES: readonly AgentTaskStatus[] = [
  'pending',
  'active',
  'completed',
  'failed',
  'cancelled',
];

export const MAX_AGENT_TASKS = 12;

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Reads the `tasks` argument of `update_task_list`. Returns null for anything
 * the composer could not render as a checklist (not an array, none or too many
 * tasks, a missing id or label, an unknown status, a repeated id), so the
 * agent is told to resend rather than showing half a list.
 */
export function readAgentTaskList(value: unknown): AgentTask[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_AGENT_TASKS
  ) {
    return null;
  }
  const tasks: AgentTask[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    const id = readText(record.id);
    const label = readText(record.label);
    const status = AGENT_TASK_STATUSES.find((item) => item === record.status);
    if (!id || !label || !status) return null;
    const detail = readText(record.detail);
    tasks.push({ id, label, status, ...(detail ? { detail } : {}) });
  }
  return new Set(tasks.map((task) => task.id)).size === tasks.length
    ? tasks
    : null;
}
