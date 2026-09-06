import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { NotificationsService } from '@services/core/notifications.service';
import {
  type TaskComment,
  TaskCommentsService,
} from '@services/management/task-comments.service';
import {
  type Task,
  type TaskPriority,
  type TaskStatus,
  TasksService,
} from '@services/management/tasks.service';
import { Button } from '@ui/primitives/button';
import { Cpu, ExternalLink, User } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceInspector } from '@/components/workspace-shell/WorkspaceInspectorContext';
import {
  type ProductWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfaceAdapter,
  useRegisterWorkspaceSurfacePresentationAdapter,
  type WorkspaceSurfacePresentationAdapter,
} from '@/components/workspace-shell/WorkspaceSurfaceAdapterContext';
import { dispatchOpenContextTab } from '@/lib/workspace/agent-composer-events';

import { TaskPrioritySelect, TaskStatusSelect } from './task-pills';
import { useTaskSelection } from './task-selection-context';

const EMPTY_COMMENTS: TaskComment[] = [];

function TaskCommentRow({ comment }: { comment: TaskComment }) {
  const isAgent = comment.isAgentComment;
  return (
    <li className="flex gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {isAgent ? (
          <Cpu aria-hidden="true" className="size-3.5" />
        ) : (
          <User aria-hidden="true" className="size-3.5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="font-medium text-foreground">
            {isAgent ? 'Agent' : 'User'}
          </span>
          <span className="text-foreground/45">
            {getRelativeTime(comment.createdAt)}
          </span>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/85">
          {comment.body}
        </p>
      </div>
    </li>
  );
}

function TaskInspector({ task }: { task: Task }) {
  const translate = useTranslations('pages.tasks.inspector');
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const { href } = useOrgUrl();
  const selection = useTaskSelection();
  const [comments, setComments] = useState<TaskComment[]>(EMPTY_COMMENTS);
  const [isSaving, setIsSaving] = useState(false);
  const getTasksService = useAuthedService((token) =>
    TasksService.getInstance(token),
  );
  const getCommentsService = useAuthedService((token) =>
    TaskCommentsService.getInstanceForTask(token, task.id),
  );

  useEffect(() => {
    const controller = new AbortController();
    setComments(EMPTY_COMMENTS);
    void getCommentsService()
      .then((service) => service.list())
      .then((data) => {
        if (!controller.signal.aborted) setComments(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setComments(EMPTY_COMMENTS);
      });
    return () => controller.abort();
  }, [getCommentsService]);

  const updateTask = useCallback(
    async (input: { status?: TaskStatus; priority?: TaskPriority }) => {
      setIsSaving(true);
      try {
        const service = await getTasksService();
        const updated = await service.updateTask(task.id, input);
        selection?.commitTask(updated);
      } catch {
        notificationsService.error('Could not update task. Please try again.');
      } finally {
        setIsSaving(false);
      }
    },
    [getTasksService, notificationsService, selection, task.id],
  );

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4"
      data-testid="task-surface-inspector"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TaskStatusSelect
            ariaLabel={translate('status')}
            isDisabled={isSaving}
            value={task.status}
            onChange={(status) => void updateTask({ status })}
          />
          <TaskPrioritySelect
            ariaLabel={translate('priority')}
            isDisabled={isSaving}
            value={task.priority}
            onChange={(priority) => void updateTask({ priority })}
          />
        </div>
        <h3 className="text-sm font-semibold leading-snug text-foreground">
          {task.title}
        </h3>
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          className="w-fit"
        >
          <Link href={href(`${APP_ROUTES.WORKSPACE.TASKS}/${task.identifier}`)}>
            <ExternalLink aria-hidden="true" className="size-3.5" />
            {translate('openFullPage')}
          </Link>
        </Button>
      </div>

      {task.description ? (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
            {translate('description')}
          </h4>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/75">
            {task.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h4 className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
          {translate('comments', { count: comments.length })}
        </h4>
        {comments.length > 0 ? (
          <ol className="flex flex-col gap-4">
            {comments.map((comment) => (
              <TaskCommentRow key={comment.id} comment={comment} />
            ))}
          </ol>
        ) : (
          <p className="text-xs text-foreground/45">
            {translate('noComments')}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Projects the task opened from the list into the workspace inspector rail,
 * the same way the library projects its selected asset. The list only sets
 * `?taskId=`; this adapter owns everything rendered on the right.
 */
export default function TaskInspectorAdapter() {
  const translate = useTranslations('pages.tasks.inspector');
  const { brandId, organizationId } = useBrand();
  const selection = useTaskSelection();
  const selectedTask = selection?.selectedTask ?? null;
  const inspector = useWorkspaceInspector();
  const setInspectorOpen = inspector?.setIsOpen;
  const previousTaskIdRef = useRef<string | null>(null);

  // Open the rail when a *different* task is selected; never fight a collapse.
  useEffect(() => {
    const nextId = selectedTask?.id ?? null;
    const previousId = previousTaskIdRef.current;
    previousTaskIdRef.current = nextId;
    if (!nextId || nextId === previousId || !setInspectorOpen) return;
    setInspectorOpen(true);
    dispatchOpenContextTab();
  }, [selectedTask?.id, setInspectorOpen]);

  const inspectorNode = useMemo(
    () =>
      selectedTask ? (
        <TaskInspector key={selectedTask.id} task={selectedTask} />
      ) : (
        <p
          className="px-4 py-6 text-sm text-foreground/55"
          data-testid="task-surface-inspector"
        >
          {translate('empty')}
        </p>
      ),
    [selectedTask, translate],
  );
  const renderInspector = useCallback(() => inspectorNode, [inspectorNode]);
  const contextLabel = selectedTask ? `Tasks · ${selectedTask.title}` : 'Tasks';

  const registration = useMemo<ProductWorkspaceSurfaceAdapter>(
    () => ({
      contextLabel,
      references: [],
      renderInspector,
      scope: {
        ...(brandId ? { brandId } : {}),
        organizationId: organizationId ?? '',
      },
      surfaceKey: 'workspace',
    }),
    [brandId, contextLabel, organizationId, renderInspector],
  );
  const presentation = useMemo<WorkspaceSurfacePresentationAdapter>(
    () => ({ contextLabel, inspector: inspectorNode, surfaceKey: 'workspace' }),
    [contextLabel, inspectorNode],
  );

  useRegisterWorkspaceSurfaceAdapter(registration);
  useRegisterWorkspaceSurfacePresentationAdapter(presentation);
  return null;
}
