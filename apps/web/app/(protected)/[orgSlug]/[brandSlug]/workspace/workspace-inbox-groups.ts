import type { Task } from '@services/management/tasks.service';
import { isSameDay, subDays } from 'date-fns';

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

  if (isSameDay(date, now) || date.getTime() > now.getTime()) {
    return 'today';
  }

  return isSameDay(date, subDays(now, 1)) ? 'yesterday' : 'earlier';
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
