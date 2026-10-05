import { STATUS_PILL_CLASS } from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/task-pills';
import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { WorkspaceTranslate } from '@props/workspace/workspace-task.props';
import type { Task, TaskStatus } from '@services/management/tasks.service';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';

import {
  formatTaskStatus,
  formatTaskTimestamp,
  getTaskBadgeStatus,
} from './workspace-task.helpers';

/** Table column factory: `render` callbacks aren't components, so the
 * translate functions and resolved status labels are passed in from the
 * rendering component instead of being resolved with hooks here.
 * `translate` is scoped to `pages.workspaceOverview` (columns + relative
 * time live under it); `statusTranslate` is scoped to `pages.tasks.status`. */
export function getWorkspaceInboxTableColumns(
  translate: WorkspaceTranslate,
  statusTranslate: WorkspaceTranslate,
  statusLabels: Record<TaskStatus, string>,
  isUnread: (task: Task) => boolean,
  markRead: (task: Task) => void,
  isReadPending: boolean,
) {
  return [
    {
      key: 'title',
      header: translate('inbox.columns.task'),
      render: (task: Task) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex w-1.5 shrink-0 items-center">
            {isUnread(task) ? (
              <span className="size-1.5 rounded-full bg-info">
                <span className="sr-only">{translate('inbox.unread')}</span>
              </span>
            ) : null}
          </span>
          <span className="truncate font-medium text-foreground">
            {task.title}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: translate('inbox.columns.status'),
      className: 'w-40',
      render: (task: Task) => (
        <Badge
          status={getTaskBadgeStatus(task)}
          size={ComponentSize.SM}
          className={STATUS_PILL_CLASS}
        >
          {formatTaskStatus(task, statusLabels, statusTranslate)}
        </Badge>
      ),
    },
    {
      key: 'executionPathUsed',
      header: translate('inbox.columns.path'),
      className: 'w-36 hidden lg:table-cell',
      render: (task: Task) => (
        <span className="text-xs text-muted-foreground">
          {task.executionPathUsed?.replaceAll('_', ' ') ?? ''}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: translate('inbox.columns.updated'),
      className: 'w-28 text-right',
      render: (task: Task) => (
        <span className="text-xs text-muted-foreground">
          {formatTaskTimestamp(task, (key, values) =>
            translate(`relativeTime.${key}`, values),
          )}
        </span>
      ),
    },
    {
      key: 'read',
      header: <span className="sr-only">{translate('inbox.readActions')}</span>,
      className: 'w-28 text-right',
      render: (task: Task) =>
        isUnread(task) ? (
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            withWrapper={false}
            disabled={isReadPending}
            onClick={(event) => {
              event.stopPropagation();
              markRead(task);
            }}
          >
            {translate('inbox.markRead')}
          </Button>
        ) : null,
    },
  ];
}
