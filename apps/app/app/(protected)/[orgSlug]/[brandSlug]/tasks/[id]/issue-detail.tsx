'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type IssueComment,
  IssueCommentsService,
} from '@services/management/issue-comments.service';
import {
  type Task,
  type TaskLinkedEntityModel,
  type TaskPriority,
  type TaskStatus,
  TasksService,
} from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { HiArrowLeft, HiOutlineExclamationTriangle } from 'react-icons/hi2';
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

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: 'bg-white/10 text-white/50',
  blocked: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-white/5 text-white/30',
  done: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-500',
  in_progress: 'bg-blue-500/20 text-blue-400',
  in_review: 'bg-amber-500/20 text-amber-400',
  todo: 'bg-white/15 text-white/70',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  low: 'Low',
  medium: 'Medium',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  low: 'text-white/40',
  medium: 'text-white/60',
};

const ENTITY_MODEL_LABELS: Record<TaskLinkedEntityModel, string> = {
  Article: 'Article',
  Evaluation: 'Evaluation',
  Ingredient: 'Ingredient',
  Post: 'Post',
};

const ENTITY_MODEL_COLORS: Record<TaskLinkedEntityModel, string> = {
  Article: 'bg-purple-500/15 text-purple-400',
  Evaluation: 'bg-amber-500/15 text-amber-400',
  Ingredient: 'bg-cyan-500/15 text-cyan-400',
  Post: 'bg-emerald-500/15 text-emerald-400',
};

const VISIBLE_COMMENT_COUNT = 3;

interface IssueDetailState {
  issue: Task | null;
  comments: IssueComment[];
  children: Task[];
  isLoading: boolean;
  commentBody: string;
  isSubmitting: boolean;
  showAllComments: boolean;
}

type IssueDetailAction =
  | { type: 'LOAD_START' }
  | {
      type: 'LOAD_SUCCESS';
      payload: { issue: Task; comments: IssueComment[]; children: Task[] };
    }
  | { type: 'LOAD_ERROR' }
  | { type: 'LOAD_DONE' }
  | { type: 'SET_ISSUE'; payload: Task }
  | { type: 'APPEND_COMMENT'; payload: IssueComment }
  | { type: 'SET_COMMENT_BODY'; payload: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_END' }
  | { type: 'SHOW_ALL_COMMENTS' };

const initialIssueDetailState: IssueDetailState = {
  issue: null,
  comments: [],
  children: [],
  isLoading: true,
  commentBody: '',
  isSubmitting: false,
  showAllComments: false,
};

function issueDetailReducer(
  state: IssueDetailState,
  action: IssueDetailAction,
): IssueDetailState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, isLoading: true };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        issue: action.payload.issue,
        comments: action.payload.comments,
        children: action.payload.children,
      };
    case 'LOAD_ERROR':
      return { ...state, issue: null };
    case 'LOAD_DONE':
      return { ...state, isLoading: false };
    case 'SET_ISSUE':
      return { ...state, issue: action.payload };
    case 'APPEND_COMMENT':
      return { ...state, comments: [...state.comments, action.payload] };
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

interface IssueDetailProps {
  issueId: string;
  /** If true, treat issueId as a human-readable identifier (e.g., GEN-42) */
  useIdentifier?: boolean;
}

export default function IssueDetail({
  issueId,
  useIdentifier,
}: IssueDetailProps) {
  const [state, dispatch] = useReducer(
    issueDetailReducer,
    initialIssueDetailState,
  );
  const {
    issue,
    comments,
    children,
    isLoading,
    commentBody,
    isSubmitting,
    showAllComments,
  } = state;
  const controllerRef = useRef<AbortController | null>(null);
  const lastCommentRef = useRef<HTMLDivElement | null>(null);

  const resolvedIdRef = useRef<string | null>(null);

  const getTasksService = useAuthedService((token) =>
    TasksService.getInstance(token),
  );

  const getCommentsService = useAuthedService((token) =>
    IssueCommentsService.getInstanceForIssue(
      token,
      resolvedIdRef.current || issueId,
    ),
  );

  const loadIssue = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    dispatch({ type: 'LOAD_START' });
    try {
      const issuesService = await getTasksService();

      const issueData = useIdentifier
        ? await issuesService.getByIdentifier(issueId)
        : await issuesService.findOne(issueId);

      resolvedIdRef.current = issueData.id;
      const commentsService = await getCommentsService();

      const [commentsData, childrenData] = await Promise.all([
        commentsService.list(),
        issuesService.getChildren(issueData.id),
      ]);

      if (!controller.signal.aborted) {
        dispatch({
          type: 'LOAD_SUCCESS',
          payload: {
            issue: issueData,
            comments: commentsData,
            children: childrenData,
          },
        });
      }
    } catch {
      if (!controller.signal.aborted) {
        dispatch({ type: 'LOAD_ERROR' });
      }
    } finally {
      if (!controller.signal.aborted) {
        dispatch({ type: 'LOAD_DONE' });
      }
    }
  }, [getTasksService, getCommentsService, issueId, useIdentifier]);

  useEffect(() => {
    loadIssue();
    const controller = controllerRef.current;

    return () => {
      controller?.abort();
    };
  }, [loadIssue]);

  const handleStatusUpdate = useCallback(
    async (newStatus: TaskStatus) => {
      if (!issue) return;
      try {
        const issuesService = await getTasksService();
        const updated = await issuesService.updateTask(issue.id, {
          status: newStatus,
        });
        dispatch({ type: 'SET_ISSUE', payload: updated });
      } catch {
        // Status update failed
      }
    },
    [getTasksService, issue],
  );

  const handleAddComment = useCallback(async () => {
    if (!commentBody.trim() || isSubmitting) {
      return;
    }

    dispatch({ type: 'SUBMIT_START' });
    try {
      const commentsService = await getCommentsService();
      const newComment = await commentsService.addComment(commentBody.trim());
      dispatch({ type: 'APPEND_COMMENT', payload: newComment });
      dispatch({ type: 'SET_COMMENT_BODY', payload: '' });
    } catch {
      // Comment failed silently
    } finally {
      dispatch({ type: 'SUBMIT_END' });
    }
  }, [commentBody, getCommentsService, isSubmitting]);

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

  if (isLoading) {
    return (
      <Container>
        <LazyLoadingFallback variant="minimal" />
      </Container>
    );
  }

  if (!issue) {
    return (
      <Container>
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HiOutlineExclamationTriangle className="mb-3 size-8 text-white/20" />
            <p className="text-sm text-white/50">Issue not found</p>
            <Link
              href="/tasks"
              className="mt-3 text-xs text-blue-400 hover:text-blue-300"
            >
              Back to issues
            </Link>
          </div>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mb-4">
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/60"
        >
          <HiArrowLeft className="size-3" />
          Back to issues
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div className="space-y-6">
          <IssueHeader
            identifier={issue.identifier}
            status={issue.status}
            priority={issue.priority}
            title={issue.title}
            statusColors={STATUS_COLORS}
            statusLabels={STATUS_LABELS}
            priorityColors={PRIORITY_COLORS}
            priorityLabels={PRIORITY_LABELS}
          />

          {/* Description */}
          {issue.description ? (
            <Card>
              <div className="p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                  Description
                </h3>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                  {issue.description}
                </div>
              </div>
            </Card>
          ) : null}

          <IssueSubIssuesCard
            subIssues={children}
            statusColors={STATUS_COLORS}
            statusLabels={STATUS_LABELS}
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

        {/* Sidebar */}
        <IssueSidebar
          issue={issue}
          statusColors={STATUS_COLORS}
          statusLabels={STATUS_LABELS}
          statusTransitions={STATUS_TRANSITIONS}
          priorityColors={PRIORITY_COLORS}
          priorityLabels={PRIORITY_LABELS}
          entityModelColors={ENTITY_MODEL_COLORS}
          entityModelLabels={ENTITY_MODEL_LABELS}
          onStatusUpdate={handleStatusUpdate}
        />
      </div>
    </Container>
  );
}
