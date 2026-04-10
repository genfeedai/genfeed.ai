'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type IssueComment,
  IssueCommentsService,
} from '@services/management/issue-comments.service';
import {
  type Issue,
  type IssueLinkedEntityModel,
  type IssuePriority,
  type IssueStatus,
  IssuesService,
} from '@services/management/issues.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiArrowLeft,
  HiChevronDown,
  HiOutlineChatBubbleLeft,
  HiOutlineChevronDoubleDown,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineExclamationTriangle,
  HiOutlineLink,
  HiOutlinePhoto,
  HiOutlineUser,
} from 'react-icons/hi2';

const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  backlog: ['todo', 'cancelled'],
  blocked: ['todo', 'in_progress', 'cancelled'],
  cancelled: ['backlog', 'todo'],
  done: ['in_progress'],
  in_progress: ['blocked', 'in_review', 'done', 'cancelled'],
  in_review: ['in_progress', 'done', 'cancelled'],
  todo: ['in_progress', 'blocked', 'backlog', 'cancelled'],
};

const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  done: 'Done',
  in_progress: 'In Progress',
  in_review: 'In Review',
  todo: 'To Do',
};

const STATUS_COLORS: Record<IssueStatus, string> = {
  backlog: 'bg-white/10 text-white/50',
  blocked: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-white/5 text-white/30',
  done: 'bg-emerald-500/20 text-emerald-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  in_review: 'bg-amber-500/20 text-amber-400',
  todo: 'bg-white/15 text-white/70',
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  critical: 'Critical',
  high: 'High',
  low: 'Low',
  medium: 'Medium',
};

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  low: 'text-white/40',
  medium: 'text-white/60',
};

const ENTITY_MODEL_LABELS: Record<IssueLinkedEntityModel, string> = {
  Article: 'Article',
  Evaluation: 'Evaluation',
  Ingredient: 'Ingredient',
  Post: 'Post',
};

const ENTITY_MODEL_COLORS: Record<IssueLinkedEntityModel, string> = {
  Article: 'bg-purple-500/15 text-purple-400',
  Evaluation: 'bg-amber-500/15 text-amber-400',
  Ingredient: 'bg-cyan-500/15 text-cyan-400',
  Post: 'bg-emerald-500/15 text-emerald-400',
};

interface IssueDetailProps {
  issueId: string;
  /** If true, treat issueId as a human-readable identifier (e.g., GEN-42) */
  useIdentifier?: boolean;
}

function CommentItem({ comment }: { comment: IssueComment }) {
  const isAgent = comment.isAgentComment;

  return (
    <div className="border-b border-white/5 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            isAgent
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-white/10 text-white/50',
          )}
        >
          {isAgent ? (
            <HiOutlineCpuChip className="h-3.5 w-3.5" />
          ) : (
            <HiOutlineUser className="h-3.5 w-3.5" />
          )}
        </div>
        <span
          className={cn(
            'text-xs font-medium',
            isAgent ? 'text-blue-400' : 'text-white/60',
          )}
        >
          {isAgent ? 'Agent' : 'User'}
        </span>
        <span className="text-[10px] text-white/25">
          {getRelativeTime(comment.createdAt)}
        </span>
      </div>
      <div className="whitespace-pre-wrap pl-[34px] text-sm leading-relaxed text-white/80">
        {comment.body}
      </div>
    </div>
  );
}

function SubIssueRow({ issue }: { issue: Issue }) {
  return (
    <Link
      href={`/issues/${issue.identifier}`}
      className="flex items-center gap-3 border-b border-white/5 px-4 py-2 transition-colors hover:bg-white/[0.02]"
    >
      <span className="text-xs font-mono text-white/40">
        {issue.identifier}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-white/80">
        {issue.title}
      </span>
      <span
        className={cn(
          'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
          STATUS_COLORS[issue.status],
        )}
      >
        {STATUS_LABELS[issue.status]}
      </span>
    </Link>
  );
}

export default function IssueDetail({
  issueId,
  useIdentifier,
}: IssueDetailProps) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [children, setChildren] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [commentBody, setCommentBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const lastCommentRef = useRef<HTMLDivElement | null>(null);

  const resolvedIdRef = useRef<string | null>(null);

  const getIssuesService = useAuthedService((token) =>
    IssuesService.getInstance(token),
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
      const issuesService = await getIssuesService();

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
  }, [getIssuesService, getCommentsService, issueId, useIdentifier]);

  useEffect(() => {
    loadIssue();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadIssue]);

  const handleStatusUpdate = useCallback(
    async (newStatus: IssueStatus) => {
      if (!issue) return;
      try {
        const issuesService = await getIssuesService();
        const updated = await issuesService.updateIssue(issue.id, {
          status: newStatus,
        });
        setIssue(updated);
      } catch {
        // Status update failed
      }
    },
    [getIssuesService, issue],
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

  const VISIBLE_COMMENT_COUNT = 3;
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
            <HiOutlineExclamationTriangle className="mb-3 h-8 w-8 text-white/20" />
            <p className="text-sm text-white/50">Issue not found</p>
            <Link
              href="/issues"
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
          href="/issues"
          className="inline-flex items-center gap-1 text-xs text-white/40 transition-colors hover:text-white/60"
        >
          <HiArrowLeft className="h-3 w-3" />
          Back to issues
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-sm font-mono text-white/40">
                {issue.identifier}
              </span>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                  STATUS_COLORS[issue.status],
                )}
              >
                {STATUS_LABELS[issue.status]}
              </span>
              <span
                className={cn(
                  'text-[10px] font-medium uppercase tracking-wider',
                  PRIORITY_COLORS[issue.priority],
                )}
              >
                {PRIORITY_LABELS[issue.priority]}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-white">{issue.title}</h1>
          </div>

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

          {/* Sub-issues */}
          {children.length > 0 ? (
            <Card>
              <div className="border-b border-white/10 px-4 py-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
                    Sub-issues ({children.length})
                  </h3>
                  {(() => {
                    const doneCount = children.filter(
                      (c) => c.status === 'done',
                    ).length;
                    const pct =
                      children.length > 0
                        ? Math.round((doneCount / children.length) * 100)
                        : 0;
                    return (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-emerald-500/60 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/30">
                          {doneCount}/{children.length}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {children.map((child) => (
                <SubIssueRow issue={child} key={child.id} />
              ))}
            </Card>
          ) : null}

          {/* Comments */}
          <Card>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                <HiOutlineChatBubbleLeft className="h-3.5 w-3.5" />
                Comments ({comments.length})
              </h3>
              {comments.length > VISIBLE_COMMENT_COUNT && (
                <Button
                  type="button"
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.XS}
                  className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
                  onClick={scrollToLatestComment}
                >
                  <HiOutlineChevronDoubleDown className="h-3 w-3" />
                  Jump to latest
                </Button>
              )}
            </div>
            {comments.length > 0 ? (
              <>
                {!showAllComments && hiddenCommentCount > 0 && (
                  <Button
                    type="button"
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.XS}
                    className="flex w-full items-center justify-center gap-1.5 border-b border-white/5 py-2 text-[11px] text-white/40 hover:bg-white/[0.02] hover:text-white/60"
                    onClick={() => setShowAllComments(true)}
                  >
                    <HiChevronDown className="h-3 w-3" />
                    Show {hiddenCommentCount} earlier{' '}
                    {hiddenCommentCount === 1 ? 'comment' : 'comments'}
                  </Button>
                )}
                {visibleComments.map((comment, index) => (
                  <div
                    key={comment.id}
                    ref={
                      index === visibleComments.length - 1
                        ? lastCommentRef
                        : undefined
                    }
                  >
                    <CommentItem comment={comment} />
                  </div>
                ))}
              </>
            ) : (
              <div className="px-4 py-6 text-center text-xs text-white/25">
                No comments yet
              </div>
            )}
            <div className="border-t border-white/10 p-4">
              <Textarea
                className="mb-2 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-white/20"
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Write a comment..."
                rows={3}
                value={commentBody}
              />
              <Button
                variant={ButtonVariant.SOFT}
                size={ButtonSize.SM}
                disabled={isSubmitting || !commentBody.trim()}
                onClick={handleAddComment}
                type="button"
              >
                {isSubmitting ? 'Posting...' : 'Add Comment'}
              </Button>
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <div className="p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                Details
              </h3>
              <DefinitionList className="text-sm">
                <div>
                  <DefinitionTerm variant="label">Status</DefinitionTerm>
                  <DefinitionDetail variant="inline" className="mt-1">
                    <span
                      className={cn(
                        'inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        STATUS_COLORS[issue.status],
                      )}
                    >
                      {STATUS_LABELS[issue.status]}
                    </span>
                    {STATUS_TRANSITIONS[issue.status].length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {STATUS_TRANSITIONS[issue.status].map((s) => (
                          <Button
                            key={s}
                            type="button"
                            variant={ButtonVariant.OUTLINE}
                            size={ButtonSize.XS}
                            className="px-1.5 py-0.5 text-[9px] text-white/50 hover:text-white/70"
                            onClick={() => handleStatusUpdate(s)}
                          >
                            {STATUS_LABELS[s]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </DefinitionDetail>
                </div>
                <div>
                  <DefinitionTerm variant="label">Priority</DefinitionTerm>
                  <DefinitionDetail
                    variant="inline"
                    className={PRIORITY_COLORS[issue.priority]}
                  >
                    {PRIORITY_LABELS[issue.priority]}
                  </DefinitionDetail>
                </div>
                {issue.parentId ? (
                  <div>
                    <DefinitionTerm variant="label">
                      Parent Issue
                    </DefinitionTerm>
                    <DefinitionDetail variant="inline">
                      <Link
                        href={`/issues/${issue.parentId}`}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        View parent
                      </Link>
                    </DefinitionDetail>
                  </div>
                ) : null}
                <div>
                  <DefinitionTerm variant="label">Created</DefinitionTerm>
                  <DefinitionDetail variant="inline" className="text-white/50">
                    {getRelativeTime(issue.createdAt)}
                  </DefinitionDetail>
                </div>
                <div>
                  <DefinitionTerm variant="label">Updated</DefinitionTerm>
                  <DefinitionDetail variant="inline" className="text-white/50">
                    {getRelativeTime(issue.updatedAt)}
                  </DefinitionDetail>
                </div>
                {issue.checkoutAgentId ? (
                  <div>
                    <DefinitionTerm variant="label">
                      Checked Out By
                    </DefinitionTerm>
                    <DefinitionDetail
                      variant="inline"
                      className="text-blue-400"
                    >
                      Agent
                    </DefinitionDetail>
                  </div>
                ) : null}
              </DefinitionList>
            </div>
          </Card>

          {/* Linked Entities */}
          {issue.linkedEntities?.length > 0 ? (
            <Card>
              <div className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                  <HiOutlineLink className="h-3.5 w-3.5" />
                  Linked ({issue.linkedEntities.length})
                </h3>
                <div className="space-y-2">
                  {issue.linkedEntities.map((entity) => (
                    <div
                      key={`${entity.entityModel}-${entity.entityId}`}
                      className="flex items-center gap-2.5 rounded border border-white/5 bg-white/[0.02] px-3 py-2"
                    >
                      <span
                        className={cn(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                          ENTITY_MODEL_COLORS[entity.entityModel],
                        )}
                      >
                        {entity.entityModel === 'Ingredient' ? (
                          <HiOutlinePhoto className="h-3 w-3" />
                        ) : (
                          <HiOutlineDocumentText className="h-3 w-3" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-white/60">
                          {ENTITY_MODEL_LABELS[entity.entityModel]}
                        </span>
                        <span className="block truncate text-[10px] font-mono text-white/30">
                          {entity.entityId}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </Container>
  );
}
