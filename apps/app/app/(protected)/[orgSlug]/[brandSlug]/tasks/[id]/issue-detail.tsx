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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface IssueDetailProps {
  issueId: string;
  /** If true, treat issueId as a human-readable identifier (e.g., GEN-42) */
  useIdentifier?: boolean;
}

export default function IssueDetail({
  issueId,
  useIdentifier,
}: IssueDetailProps) {
  const [issue, setIssue] = useState<Task | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [children, setChildren] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
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

    setIsLoading(true);
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
        setIssue(issueData);
        setComments(commentsData);
        setChildren(childrenData);
      }
    } catch {
      if (!controller.signal.aborted) {
        setIssue(null);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
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
        setIssue(updated);
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

    setIsSubmitting(true);
    try {
      const commentsService = await getCommentsService();
      const newComment = await commentsService.addComment(commentBody.trim());
      setComments((prev) => [...prev, newComment]);
      setCommentBody('');
    } catch {
      // Comment failed silently
    } finally {
      setIsSubmitting(false);
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
            onShowAllComments={() => setShowAllComments(true)}
            onScrollToLatest={scrollToLatestComment}
            onCommentBodyChange={setCommentBody}
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
