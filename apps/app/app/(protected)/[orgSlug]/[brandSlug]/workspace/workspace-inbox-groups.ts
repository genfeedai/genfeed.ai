import type { Task } from '@services/management/tasks.service';
import { isToday, isYesterday } from 'date-fns';

export type WorkspaceInboxGroupKey = 'today' | 'yesterday' | 'earlier';

function getTaskTimestamp(task: Task): number {
  const source = task.updatedAt ?? task.createdAt;

  return source ? new Date(source).getTime() : Number.NaN;
}

export function getWorkspaceInboxGroupKey(
  task: Task,
  now: Date = new Date(),
): WorkspaceInboxGroupKey {
  const timestamp = getTaskTimestamp(task);

  if (Number.isNaN(timestamp)) {
    return 'earlier';
  }

  const date = new Date(timestamp);

  if (isToday(date) || date.getTime() > now.getTime()) {
    return 'today';
  }

  return isYesterday(date) ? 'yesterday' : 'earlier';
}

/**
 * Date headings only tell the truth for a newest-first list. Any other order
 * (or a task with no timestamp) renders the table flat, as before.
 */
export function getIsInboxChronologicalDescending(tasks: Task[]): boolean {
  let previous = Number.POSITIVE_INFINITY;

  for (const task of tasks) {
    const timestamp = getTaskTimestamp(task);

    if (Number.isNaN(timestamp) || timestamp > previous) {
      return false;
    }

    previous = timestamp;
  }

  return true;
}
