'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/contracts';
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
import Badge from '@ui/display/badge/Badge';
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
import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  CirclePlus,
  Columns2,
  List,
  Minus,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import IssueOverlay from './issue-overlay';
import { closeIssueOverlay, openIssueOverlay } from './issue-overlay-controls';

type ViewMode = ViewType.KANBAN | ViewType.LIST;

const STATUS_ORDER: TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'failed',
  'done',
  'cancelled',
];

const PRIORITY_ORDER: TaskPriority[] = ['low', 'medium', 'high', 'critical'];

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  done: 'Done',
  failed: 'Failed',
  in_progress: 'In Progress',
  in_review: 'In Review',
  todo: 'To Do',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  low: 'Low',
  medium: 'Medium',
};

const PRIORITY_VARIANTS: Record<
  TaskPriority,
  'error' | 'warning' | 'info' | 'secondary'
> = {
  critical: 'error',
  high: 'warning',
  low: 'secondary',
  medium: 'info',
};

const PRIORITY_ICONS: Record<TaskPriority, typeof ChevronsUp> = {
  critical: ChevronsUp,
  high: ChevronUp,
  low: ChevronDown,
  medium: Minus,
};

/** Strips field chrome so the badge itself is the select trigger. */
const PILL_TRIGGER_CLASS =
  'h-auto w-auto gap-1 rounded-full border-0 bg-transparent p-0 shadow-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring [&>svg:last-child]:size-3';

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge status={status} size={ComponentSize.SM}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

function TaskPriorityIndicator({ priority }: { priority: TaskPriority }) {
  const Icon = PRIORITY_ICONS[priority];
  return (
    <Badge
      variant={PRIORITY_VARIANTS[priority]}
      size={ComponentSize.SM}
      icon={<Icon aria-hidden="true" className="size-3" />}
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

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
        <TaskPriorityIndicator priority={issue.priority} />
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
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <TaskStatusBadge status={status} />
        <span className="text-xs text-gray-800">{issues.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {issues.map((issue) => (
          <IssueCard issue={issue} key={issue.id} onSelect={onSelect} />
        ))}
        {issues.length === 0 ? (
          <div className="rounded border border-dashed border-border p-4 text-center text-xs text-gray-800">
            No tasks
          </div>
        ) : null}
      </div>
    </div>
  );
}

type IssuesListState = {
  issues: Task[];
  isLoading: boolean;
  viewMode: ViewMode;
  statusFilter: TaskStatus | '';
  showCreateDialog: boolean;
  createTitle: string;
  createDescription: string;
  createPriority: TaskPriority;
  isCreating: boolean;
  selectedIssue: Task | null;
};

type IssuesListAction =
  | { type: 'SET_ISSUES'; payload: Task[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_STATUS_FILTER'; payload: TaskStatus | '' }
  | { type: 'SET_SHOW_CREATE_DIALOG'; payload: boolean }
  | { type: 'SET_CREATE_TITLE'; payload: string }
  | { type: 'SET_CREATE_DESCRIPTION'; payload: string }
  | { type: 'SET_CREATE_PRIORITY'; payload: TaskPriority }
  | { type: 'SET_CREATING'; payload: boolean }
  | { type: 'SET_SELECTED_ISSUE'; payload: Task | null }
  | { type: 'RESET_CREATE_FORM' };

const initialIssuesListState: IssuesListState = {
  createDescription: '',
  createPriority: 'medium',
  createTitle: '',
  isCreating: false,
  isLoading: true,
  issues: [],
  selectedIssue: null,
  showCreateDialog: false,
  statusFilter: '',
  viewMode: ViewType.LIST,
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
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };
    case 'SET_STATUS_FILTER':
      return { ...state, statusFilter: action.payload };
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
    case 'SET_SELECTED_ISSUE':
      return { ...state, selectedIssue: action.payload };
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
    selectedIssue,
    showCreateDialog,
    statusFilter,
    viewMode,
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

  const setTaskUrl = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('taskId', id);
      else params.delete('taskId');
      router.replace(`${pathname}${params.size ? `?${params}` : ''}`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const handleSelectIssue = useCallback(
    (issue: Task) => {
      dispatch({ type: 'SET_SELECTED_ISSUE', payload: issue });
      setTaskUrl(issue.id);
      openIssueOverlay();
    },
    [setTaskUrl],
  );

  useEffect(() => {
    if (!taskId) {
      dispatch({ type: 'SET_SELECTED_ISSUE', payload: null });
      closeIssueOverlay();
      return;
    }
    let cancelled = false;
    const showTask = (issue: Task) => {
      if (cancelled) return;
      dispatch({ type: 'SET_SELECTED_ISSUE', payload: issue });
      openIssueOverlay();
    };
    const issue = issues.find((item) => item.id === taskId);
    if (issue) showTask(issue);
    else if (!isLoading)
      void getTasksService()
        .then((service) => service.findOne(taskId))
        .then(showTask)
        .catch(() => {
          if (!cancelled) notificationsService.error('Could not open task.');
        });
    return () => {
      cancelled = true;
    };
  }, [taskId, issues, isLoading, getTasksService, notificationsService]);

  const handleOverlayClose = useCallback(() => {
    dispatch({ type: 'SET_SELECTED_ISSUE', payload: null });
    setTaskUrl(null);
  }, [setTaskUrl]);

  const updateIssue = async (
    issue: Task,
    input: { status?: TaskStatus; priority?: TaskPriority },
  ) => {
    setSavingId(issue.id);
    try {
      const service = await getTasksService();
      await service.updateTask(issue.id, input);
      await loadIssues();
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
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          className="inline-flex items-center gap-1.5"
          onClick={openCreateDialog}
        >
          <CirclePlus className="size-3.5" aria-hidden="true" />
          New Task
        </Button>
      ) : null}
      <Select
        value={statusFilter || 'all'}
        onValueChange={(value) =>
          dispatch({
            type: 'SET_STATUS_FILTER',
            payload: value === 'all' ? '' : (value as TaskStatus),
          })
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
            dispatch({ type: 'SET_VIEW_MODE', payload: nextView })
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
                  <span className="flex items-baseline gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {issue.identifier}
                    </span>
                    <span>{issue.title}</span>
                  </span>
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
                <Select
                  value={issue.status}
                  disabled={savingId === issue.id}
                  onValueChange={(status) =>
                    void updateIssue(issue, { status: status as TaskStatus })
                  }
                >
                  <SelectTrigger
                    aria-label={`Status for ${issue.identifier}`}
                    className={PILL_TRIGGER_CLASS}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((status) => (
                      <SelectItem key={status} value={status}>
                        <TaskStatusBadge status={status} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              render: (issue) => (
                <Select
                  value={issue.priority}
                  disabled={savingId === issue.id}
                  onValueChange={(priority) =>
                    void updateIssue(issue, {
                      priority: priority as TaskPriority,
                    })
                  }
                >
                  <SelectTrigger
                    aria-label={`Priority for ${issue.identifier}`}
                    className={PILL_TRIGGER_CLASS}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_ORDER.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        <TaskPriorityIndicator priority={priority} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
          ]}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
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
      <IssueOverlay issue={selectedIssue} onClose={handleOverlayClose} />
    </Container>
  );
}
