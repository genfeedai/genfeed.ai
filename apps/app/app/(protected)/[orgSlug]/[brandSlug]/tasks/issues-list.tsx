'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, ViewType } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { NotificationsService } from '@services/core/notifications.service';
import {
  type Task,
  type TaskPriority,
  type TaskStatus,
  TasksService,
} from '@services/management/tasks.service';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { SkeletonTable } from '@ui/display/skeleton/skeleton';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { CirclePlus, Columns2, List } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  TaskPriorityBadge,
  TaskPrioritySelect,
  TaskStatusBadge,
  TaskStatusSelect,
} from './task-pills';
import { useTaskSelection } from './task-selection-context';

type ViewMode = ViewType.KANBAN | ViewType.LIST;

function IssueCard({
  issue,
  onSelect,
}: {
  issue: Task;
  onSelect: (issue: Task) => void;
}) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      className="block w-full rounded border border-border bg-card/60 p-3 text-left transition-colors hover:bg-muted/60"
      onClick={() => onSelect(issue)}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-2xs font-mono text-gray-800">
          {issue.identifier}
        </span>
        <TaskPriorityBadge priority={issue.priority} />
      </div>
      <p className="mb-2 text-sm leading-snug text-foreground">{issue.title}</p>
      {issue.assigneeUserId ? (
        <span className="text-2xs text-gray-800">Assigned</span>
      ) : null}
    </Button>
  );
}

function KanbanColumn({
  status,
  issues,
  onSelect,
}: {
  status: TaskStatus;
  issues: Task[];
  onSelect: (issue: Task) => void;
}) {
  return (
    <section
      aria-label={STATUS_LABELS[status]}
      className="flex h-full w-72 shrink-0 flex-col rounded-lg bg-background-secondary"
    >
      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <TaskStatusBadge status={status} />
        <span className="text-xs text-muted-foreground">{issues.length}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {issues.map((issue) => (
          <IssueCard issue={issue} key={issue.id} onSelect={onSelect} />
        ))}
        {issues.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No tasks
          </p>
        ) : null}
      </div>
    </section>
  );
}

type IssuesListState = {
  issues: Task[];
  isLoading: boolean;
  showCreateDialog: boolean;
  createTitle: string;
  createDescription: string;
  createPriority: TaskPriority;
  isCreating: boolean;
};

type IssuesListAction =
  | { type: 'SET_ISSUES'; payload: Task[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SHOW_CREATE_DIALOG'; payload: boolean }
  | { type: 'SET_CREATE_TITLE'; payload: string }
  | { type: 'SET_CREATE_DESCRIPTION'; payload: string }
  | { type: 'SET_CREATE_PRIORITY'; payload: TaskPriority }
  | { type: 'SET_CREATING'; payload: boolean }
  | { type: 'RESET_CREATE_FORM' };

const initialIssuesListState: IssuesListState = {
  createDescription: '',
  createPriority: 'medium',
  createTitle: '',
  isCreating: false,
  isLoading: true,
  issues: [],
  showCreateDialog: false,
};

function issuesListReducer(
  state: IssuesListState,
  action: IssuesListAction,
): IssuesListState {
  switch (action.type) {
    case 'SET_ISSUES':
      return { ...state, issues: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_SHOW_CREATE_DIALOG':
      return { ...state, showCreateDialog: action.payload };
    case 'SET_CREATE_TITLE':
      return { ...state, createTitle: action.payload };
    case 'SET_CREATE_DESCRIPTION':
      return { ...state, createDescription: action.payload };
    case 'SET_CREATE_PRIORITY':
      return { ...state, createPriority: action.payload };
    case 'SET_CREATING':
      return { ...state, isCreating: action.payload };
    case 'RESET_CREATE_FORM':
      return {
        ...state,
        createDescription: '',
        createPriority: 'medium',
        createTitle: '',
        isCreating: false,
        showCreateDialog: false,
      };
    default:
      return state;
  }
}

export default function IssuesList() {
  const { brandId } = useBrand();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [savingId, setSavingId] = useState<string | null>(null);
  const taskId = searchParams.get('taskId');
  // View and filter live in the URL so a refresh or shared link restores them.
  const viewMode: ViewMode =
    searchParams.get('view') === ViewType.KANBAN
      ? ViewType.KANBAN
      : ViewType.LIST;
  const statusParam = searchParams.get('status');
  const statusFilter: TaskStatus | '' =
    statusParam && STATUS_ORDER.includes(statusParam as TaskStatus)
      ? (statusParam as TaskStatus)
      : '';
  const selection = useTaskSelection();
  const selectTask = selection?.selectTask;
  const commitTask = selection?.commitTask;
  const selectionRevision = selection?.revision ?? 0;
  const [state, dispatch] = useReducer(
    issuesListReducer,
    initialIssuesListState,
  );
  const {
    createDescription,
    createPriority,
    createTitle,
    isCreating,
    isLoading,
    issues,
    showCreateDialog,
  } = state;
  const controllerRef = useRef<AbortController | null>(null);

  const getTasksService = useAuthedService((token) =>
    TasksService.getInstance(token),
  );

  const loadIssues = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const service = await getTasksService();
      const result = await service.list({
        ...(statusFilter ? { status: statusFilter } : {}),
        // Brand selected → filter. Brand cleared on org Workspace → all brands.
        ...(brandId ? { brandId } : {}),
      });
      if (!controller.signal.aborted) {
        dispatch({ type: 'SET_ISSUES', payload: result });
      }
    } catch {
      if (!controller.signal.aborted) {
        dispatch({ type: 'SET_ISSUES', payload: [] });
      }
    } finally {
      if (!controller.signal.aborted) {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  }, [brandId, getTasksService, statusFilter]);

  const handleCreateIssue = useCallback(async () => {
    if (!createTitle.trim() || isCreating) return;
    dispatch({ type: 'SET_CREATING', payload: true });
    try {
      const service = await getTasksService();
      await service.createTask({
        description: createDescription.trim() || undefined,
        priority: createPriority,
        status: 'todo',
        title: createTitle.trim(),
      });
      dispatch({ type: 'RESET_CREATE_FORM' });
      loadIssues();
    } catch {
      // Create failed
      dispatch({ type: 'SET_CREATING', payload: false });
    }
  }, [
    createTitle,
    createDescription,
    createPriority,
    isCreating,
    getTasksService,
    loadIssues,
  ]);

  useEffect(() => {
    loadIssues();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadIssues]);

  const setUrlParam = useCallback(
    (key: 'status' | 'taskId' | 'view', value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.replace(`${pathname}${params.size ? `?${params}` : ''}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );
  const setTaskUrl = useCallback(
    (id: string | null) => setUrlParam('taskId', id),
    [setUrlParam],
  );

  const handleSelectIssue = useCallback(
    (issue: Task) => {
      selectTask?.(issue);
      setTaskUrl(issue.id);
    },
    [selectTask, setTaskUrl],
  );

  // `?taskId=` is the source of truth for the inspector: resolve it from the
  // loaded list first, and only fetch when the task is outside the current page.
  useEffect(() => {
    if (!taskId) {
      selectTask?.(null);
      return;
    }
    let cancelled = false;
    const issue = issues.find((item) => item.id === taskId);
    if (issue) {
      selectTask?.(issue);
    } else if (!isLoading) {
      void getTasksService()
        .then((service) => service.findOne(taskId))
        .then((task) => {
          if (!cancelled) selectTask?.(task);
        })
        .catch(() => {
          if (!cancelled) notificationsService.error('Could not open task.');
        });
    }
    return () => {
      cancelled = true;
    };
  }, [
    taskId,
    issues,
    isLoading,
    getTasksService,
    notificationsService,
    selectTask,
  ]);

  // The inspector saves through the shared selection; refetch so rows match.
  useEffect(() => {
    if (selectionRevision > 0) void loadIssues();
  }, [selectionRevision, loadIssues]);

  const updateIssue = async (
    issue: Task,
    input: { status?: TaskStatus; priority?: TaskPriority },
  ) => {
    setSavingId(issue.id);
    try {
      const service = await getTasksService();
      const updated = await service.updateTask(issue.id, input);
      if (selection?.selectedTask?.id === issue.id) commitTask?.(updated);
      else await loadIssues();
    } catch {
      notificationsService.error('Could not update task. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  const groupedByStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = issues.filter((issue) => issue.status === status);
      return acc;
    },
    {} as Record<TaskStatus, Task[]>,
  );

  const isFiltered = statusFilter.length > 0;
  const hasItems = issues.length > 0;
  const isEmpty = !isLoading && !hasItems;
  // Zero tasks and no status filter: start empty — no action bar, CTA in card.
  const isStartEmpty = isEmpty && !isFiltered;
  // Never flash the action bar on first load of an empty unfiltered list
  // (that clip was toolbar → empty card). Show toolbar only when filtered or
  // when we already have rows.
  const showToolbar = isFiltered || hasItems;

  const openCreateDialog = useCallback(() => {
    dispatch({ type: 'SET_SHOW_CREATE_DIALOG', payload: true });
  }, []);

  // Same Container header chrome as Inbox (mb-4 pb-3 under py-5).
  const toolbar = showToolbar ? (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      {hasItems ? (
        <Button
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          onClick={openCreateDialog}
        >
          <CirclePlus className="size-4" aria-hidden="true" />
          New Task
        </Button>
      ) : null}
      <Select
        value={statusFilter || 'all'}
        onValueChange={(value) =>
          setUrlParam('status', value === 'all' ? null : value)
        }
      >
        <SelectTrigger className="w-auto text-xs">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_ORDER.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasItems ? (
        <ViewToggle
          activeView={viewMode}
          onChange={(nextView) =>
            setUrlParam(
              'view',
              nextView === ViewType.KANBAN ? ViewType.KANBAN : null,
            )
          }
          options={[
            {
              ariaLabel: 'List view',
              icon: <List aria-hidden="true" className="size-4" />,
              label: 'List view',
              type: ViewType.LIST,
            },
            {
              ariaLabel: 'Kanban view',
              icon: <Columns2 aria-hidden="true" className="size-4" />,
              label: 'Kanban view',
              type: ViewType.KANBAN,
            },
          ]}
        />
      ) : null}
    </div>
  ) : undefined;

  return (
    <Container
      fullWidth
      label="Tasks"
      titleVisibility="sr-only"
      right={toolbar}
    >
      {isLoading ? (
        <SkeletonTable rows={6} columns={4} />
      ) : isEmpty ? (
        <CardEmpty
          label={isFiltered ? 'No matching tasks' : 'No tasks yet'}
          description={
            isFiltered
              ? 'Try a different status, or clear the filter to see every task.'
              : 'Create a task to start tracking work in this workspace.'
          }
          action={
            isStartEmpty
              ? {
                  label: 'New Task',
                  onClick: openCreateDialog,
                  variant: ButtonVariant.DEFAULT,
                }
              : undefined
          }
        />
      ) : viewMode === ViewType.LIST ? (
        <Table<Task>
          ariaLabel="Tasks"
          items={issues}
          getRowKey={(issue) => issue.id}
          onRowClick={handleSelectIssue}
          columns={[
            {
              key: 'title',
              header: 'Task',
              render: (issue) => (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  textTransform="none"
                  className="w-full flex-col items-start gap-0 text-left text-sm font-medium"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleSelectIssue(issue);
                  }}
                >
                  <span className="block">{issue.title}</span>
                  {issue.description ? (
                    <span className="mt-1 block line-clamp-2 text-xs font-normal text-muted-foreground">
                      {issue.description}
                    </span>
                  ) : null}
                </Button>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (issue) => (
                <TaskStatusSelect
                  ariaLabel={`Status for ${issue.title}`}
                  isDisabled={savingId === issue.id}
                  value={issue.status}
                  onChange={(status) => void updateIssue(issue, { status })}
                />
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              render: (issue) => (
                <TaskPrioritySelect
                  ariaLabel={`Priority for ${issue.title}`}
                  isDisabled={savingId === issue.id}
                  value={issue.priority}
                  onChange={(priority) => void updateIssue(issue, { priority })}
                />
              ),
            },
          ]}
        />
      ) : (
        <div
          className="flex h-[calc(100dvh-10rem)] min-h-96 gap-3 overflow-x-auto"
          data-testid="tasks-kanban-board"
        >
          {STATUS_ORDER.map((status) => (
            <KanbanColumn
              issues={groupedByStatus[status]}
              key={status}
              status={status}
              onSelect={handleSelectIssue}
            />
          ))}
        </div>
      )}
      <Dialog
        open={showCreateDialog}
        onOpenChange={(open) =>
          dispatch({ type: 'SET_SHOW_CREATE_DIALOG', payload: open })
        }
      >
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Title
              </span>
              <Input
                type="text"
                placeholder="Task title"
                value={createTitle}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_CREATE_TITLE',
                    payload: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Description
              </span>
              <Textarea
                className="w-full rounded border border-border bg-muted/50 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-border-strong"
                placeholder="Optional description"
                rows={4}
                value={createDescription}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_CREATE_DESCRIPTION',
                    payload: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Priority
              </span>
              <Select
                value={createPriority}
                onValueChange={(value) =>
                  dispatch({
                    type: 'SET_CREATE_PRIORITY',
                    payload: value as TaskPriority,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ORDER.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() =>
                dispatch({ type: 'SET_SHOW_CREATE_DIALOG', payload: false })
              }
            >
              Cancel
            </Button>
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className={cn(isCreating && 'cursor-not-allowed opacity-50')}
              disabled={isCreating || !createTitle.trim()}
              onClick={handleCreateIssue}
            >
              {isCreating ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  );
}
