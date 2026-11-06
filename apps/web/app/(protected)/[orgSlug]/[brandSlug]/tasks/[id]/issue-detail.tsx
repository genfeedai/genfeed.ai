'use client';
import {
  useTaskPriorityLabels,
  useTaskStatusLabels,
} from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/task-status.constants';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { TaskPriority, TaskStatus } from '@genfeedai/contracts/interfaces';
import { updateCachedQueries } from '@hooks/auth/update-cached-queries/update-cached-queries';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useRefreshScope } from '@hooks/auth/use-refresh-scope/use-refresh-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import {
  type TaskComment,
  TaskCommentsService,
} from '@services/management/task-comments.service';
import {
  type Task,
  type TaskLinkedEntityModel,
  TasksService,
} from '@services/management/tasks.service';
import { useQueryClient } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import { EmptyState } from '@ui/primitives/empty-state';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type {
  IssueDetailAction,
  IssueDetailProps,
  IssueDetailState,
  TaskCommentsServiceFactory,
} from '@/features/tasks/props/issue-detail.props';
import {
  TASK_DETAIL_QUERY_KEY,
  TASKS_LIST_QUERY_KEY,
} from '@/lib/constants/tasks-query-keys';
import IssueCommentsCard from './issue-comments-card';
import IssueHeader from './issue-header';
import IssueSidebar from './issue-sidebar';
import IssueSubIssuesCard from './issue-sub-issues-card';

const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  backlog: ['todo', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  cancelled: ['backlog', 'todo'],
  done: ['in_progress'],
  failed: ['backlog', 'todo'],
  in_progress: ['blocked', 'in_review', 'done', 'cancelled'],
  in_review: ['in_progress', 'done', 'cancelled'],
  todo: ['in_progress', 'blocked', 'backlog', 'cancelled'],
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: 'text-destructive',
  high: 'text-warning',
  low: 'text-gray-800',
  medium: 'text-muted-foreground',
};

const ENTITY_MODEL_LABELS: Record<TaskLinkedEntityModel, string> = {
  Article: 'Article',
  Evaluation: 'Evaluation',
  Ingredient: 'Ingredient',
  Post: 'Post',
};

const ENTITY_MODEL_COLORS: Record<TaskLinkedEntityModel, string> = {
  Article: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
  Evaluation: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  Ingredient: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
  Post: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

const VISIBLE_COMMENT_COUNT = 3;

const EMPTY_COMMENTS: TaskComment[] = [];
const EMPTY_CHILDREN: Task[] = [];

function createTaskCommentsServices(token: string): TaskCommentsServiceFactory {
  return (taskId) => TaskCommentsService.getInstanceForTask(token, taskId);
}

function issueDetailQueryKey(issueId: string, useIdentifier: boolean) {
  return [
    ...TASK_DETAIL_QUERY_KEY,
    useIdentifier ? 'identifier' : 'id',
    issueId,
  ] as const;
}

function taskChildrenQueryKey(taskId: string) {
  return ['task-children', taskId] as const;
}

/** Shared with the task inspector, which reads the same comments. */
function taskCommentsQueryKey(taskId: string) {
  return ['task-comments', taskId] as const;
}

const initialIssueDetailState: IssueDetailState = {
  commentBody: '',
  isSubmitting: false,
  showAllComments: false,
};

function issueDetailReducer(
  state: IssueDetailState,
  action: IssueDetailAction,
): IssueDetailState {
  switch (action.type) {
    case 'SET_COMMENT_BODY':
      return { ...state, commentBody: action.payload };
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true };
    case 'SUBMIT_END':
      return { ...state, isSubmitting: false };
    case 'SHOW_ALL_COMMENTS':
      return { ...state, showAllComments: true };
    default:
      return state;
  }
}

export default function IssueDetail({
  issueId,
  useIdentifier = false,
}: IssueDetailProps) {
  const statusLabels = useTaskStatusLabels();
  const priorityLabels = useTaskPriorityLabels();
  const { href } = useOrgUrl();
  const notificationsService = NotificationsService.getInstance();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    issueDetailReducer,
    initialIssueDetailState,
  );
  const { commentBody, isSubmitting, showAllComments } = state;
  const lastCommentRef = useRef<HTMLDivElement | null>(null);

  // The task, its sub-issues and its comments read through React Query, so
  // reopening a task paints it at once and refreshes it in the background.
  // Sub-issues read on their own: a failed sub-issue read never hides the task.
  const detailQuery = useAuthedQuery<TasksService, Task>({
    queryFn: (service) =>
      useIdentifier
        ? service.getByIdentifier(issueId)
        : service.findOne(issueId),
    queryKey: issueDetailQueryKey(issueId, useIdentifier),
    service: (token: string) => TasksService.getInstance(token),
  });
  const issue = detailQuery.data ?? null;
  const taskId = issue?.id ?? '';

  const childrenQuery = useAuthedQuery<TasksService, Task[]>({
    enabled: Boolean(taskId),
    queryFn: (service) => service.getChildren(taskId),
    queryKey: taskChildrenQueryKey(taskId),
    service: (token: string) => TasksService.getInstance(token),
  });
  const children = taskId
    ? (childrenQuery.data ?? EMPTY_CHILDREN)
    : EMPTY_CHILDREN;

  const commentsQuery = useAuthedQuery<
    TaskCommentsServiceFactory,
    TaskComment[]
  >({
    enabled: Boolean(taskId),
    queryFn: (forTask) => forTask(taskId).list(),
    queryKey: taskCommentsQueryKey(taskId),
    service: createTaskCommentsServices,
  });
  // Comments posted while no list could be read stay on screen until a read
  // that holds them lands; the partial list is never cached as the whole one.
  const [postedComments, setPostedComments] = useState<
    { comment: TaskComment; taskId: string }[]
  >([]);
  const comments = useMemo(() => {
    if (!taskId) {
      return EMPTY_COMMENTS;
    }
    const listed = commentsQuery.data ?? EMPTY_COMMENTS;
    const unlisted = postedComments
      .filter((posted) => posted.taskId === taskId)
      .map((posted) => posted.comment)
      .filter((posted) => !listed.some((comment) => comment.id === posted.id));
    return unlisted.length > 0 ? [...listed, ...unlisted] : listed;
  }, [commentsQuery.data, postedComments, taskId]);
  // A failed background refresh keeps the task on screen; the not-found card
  // only replaces it when nothing was ever read. Sub-issues and comments hold
  // the page only on their first read: a retry after a failed read (such as
  // the one posting a comment starts) never swaps the page for the skeleton.
  const isLoading =
    detailQuery.isPending ||
    (Boolean(taskId) &&
      ((childrenQuery.isPending && !childrenQuery.isFetched) ||
        (commentsQuery.isPending && !commentsQuery.isFetched)));

  const loadError =
    detailQuery.error ?? childrenQuery.error ?? commentsQuery.error;
  useEffect(() => {
    if (!loadError) {
      return;
    }
    logger.error('Failed to load task detail', { error: loadError, issueId });
  }, [issueId, loadError]);

  const getTasksService = useAuthedService((token) =>
    TasksService.getInstance(token),
  );

  const getCommentsService = useAuthedService((token) =>
    TaskCommentsService.getInstanceForTask(token, taskId || issueId),
  );

  const updateCachedIssue = useCallback(
    async (updated: Task) => {
      const queryKey = issueDetailQueryKey(issueId, useIdentifier);
      // A read already in flight would land after this write and undo it.
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueriesData<Task>({ queryKey }, (current) =>
        current ? updated : current,
      );
    },
    [issueId, queryClient, useIdentifier],
  );

  const refreshTaskLists = useRefreshScope(TASKS_LIST_QUERY_KEY);

  const handleStatusUpdate = useCallback(
    async (newStatus: TaskStatus) => {
      if (!issue) return;
      try {
        const issuesService = await getTasksService();
        const updated = await issuesService.updateTask(issue.id, {
          status: newStatus,
        });
        await updateCachedIssue(updated);
        // Task lists elsewhere filter and count by status: re-read them.
        await refreshTaskLists();
      } catch (error) {
        logger.error('Failed to update task status', {
          error,
          status: newStatus,
          taskId: issue.id,
        });
        notificationsService.error('Failed to update task status');
      }
    },
    [
      getTasksService,
      issue,
      notificationsService,
      refreshTaskLists,
      updateCachedIssue,
    ],
  );

  const handleAddComment = useCallback(async () => {
    if (!commentBody.trim() || isSubmitting) {
      return;
    }

    dispatch({ type: 'SUBMIT_START' });
    try {
      const commentsService = await getCommentsService();
      const newComment = await commentsService.addComment(commentBody.trim());
      setPostedComments((current) => [
        ...current,
        { comment: newComment, taskId },
      ]);
      // Appended to a cached list; with none cached (the read failed), the
      // list reads again and the posted comment shows until it lands.
      await updateCachedQueries<TaskComment[]>(
        queryClient,
        { queryKey: taskCommentsQueryKey(taskId) },
        (current) => [...current, newComment],
      );
      dispatch({ type: 'SET_COMMENT_BODY', payload: '' });
    } catch (error) {
      logger.error('Failed to add task comment', {
        error,
        taskId: issue?.id ?? issueId,
      });
      notificationsService.error('Failed to add comment');
    } finally {
      dispatch({ type: 'SUBMIT_END' });
    }
  }, [
    commentBody,
    getCommentsService,
    isSubmitting,
    issue?.id,
    issueId,
    notificationsService,
    queryClient,
    taskId,
  ]);

  const hiddenCommentCount = Math.max(
    0,
    comments.length - VISIBLE_COMMENT_COUNT,
  );
  const visibleComments = useMemo(
    () =>
      showAllComments || comments.length <= VISIBLE_COMMENT_COUNT
        ? comments
        : comments.slice(-VISIBLE_COMMENT_COUNT),
    [comments, showAllComments],
  );

  const scrollToLatestComment = useCallback(() => {
    lastCommentRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <Container label={issue?.title || 'Issue'}>
      <div className="mb-4">
        <Link
          href={href(APP_ROUTES.WORKSPACE.TASKS)}
          className="inline-flex items-center gap-1 text-xs text-gray-800 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to issues
        </Link>
      </div>

      {isLoading ? (
        <div
          className="grid gap-6 lg:grid-cols-[1fr_300px]"
          data-testid="issue-detail-loading"
        >
          <div className="space-y-6">
            <SkeletonCard showImage={false} />
            <SkeletonCard showImage={false} />
            <SkeletonCard showImage={false} />
          </div>
          <SkeletonCard showImage={false} />
        </div>
      ) : !issue ? (
        <EmptyState
          surface="card"
          icon={TriangleAlert}
          title="Issue not found"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-6">
            <IssueHeader
              identifier={issue.identifier}
              status={issue.status}
              priority={issue.priority}
              title={issue.title}
              statusLabels={statusLabels}
              priorityColors={PRIORITY_COLORS}
              priorityLabels={priorityLabels}
            />

            {issue.description ? (
              <Card>
                <div className="p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-800">
                    Description
                  </h3>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {issue.description}
                  </div>
                </div>
              </Card>
            ) : null}

            <IssueSubIssuesCard
              subIssues={children}
              statusLabels={statusLabels}
            />

            <IssueCommentsCard
              comments={comments}
              visibleComments={visibleComments}
              hiddenCommentCount={hiddenCommentCount}
              showAllComments={showAllComments}
              commentBody={commentBody}
              isSubmitting={isSubmitting}
              lastCommentRef={lastCommentRef}
              visibleCommentCount={VISIBLE_COMMENT_COUNT}
              onShowAllComments={() => dispatch({ type: 'SHOW_ALL_COMMENTS' })}
              onScrollToLatest={scrollToLatestComment}
              onCommentBodyChange={(body) =>
                dispatch({ type: 'SET_COMMENT_BODY', payload: body })
              }
              onAddComment={handleAddComment}
            />
          </div>

          <IssueSidebar
            issue={issue}
            statusLabels={statusLabels}
            statusTransitions={STATUS_TRANSITIONS}
            priorityColors={PRIORITY_COLORS}
            priorityLabels={priorityLabels}
            entityModelColors={ENTITY_MODEL_COLORS}
            entityModelLabels={ENTITY_MODEL_LABELS}
            onStatusUpdate={handleStatusUpdate}
          />
        </div>
      )}
    </Container>
  );
}
