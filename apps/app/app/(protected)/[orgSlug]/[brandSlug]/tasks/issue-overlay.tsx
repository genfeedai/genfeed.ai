'use client';

import { ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type IssueComment,
  IssueCommentsService,
} from '@services/management/issue-comments.service';
import type {
  Task,
  TaskLinkedEntityModel,
  TaskStatus,
} from '@services/management/tasks.service';
import Badge from '@ui/display/badge/Badge';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { Button } from '@ui/primitives/button';
import {
  ChevronDown,
  Cpu,
  FileText,
  Image,
  Link,
  MessageCircle,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { closeIssueOverlay, ISSUE_OVERLAY_ID } from './issue-overlay-controls';

const VISIBLE_COMMENT_COUNT = 3;

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

interface IssueOverlayProps {
  issue: Task | null;
  onClose?: () => void;
}

interface IssueCommentVisibility {
  issueId: string | null;
  showAll: boolean;
}

interface IssueCommentsState {
  comments: IssueComment[];
  issueId: string | null;
}

export default function IssueOverlay({ issue, onClose }: IssueOverlayProps) {
  const { push } = useRouter();
  const issueId = issue?.id ?? null;
  const [commentsState, setCommentsState] = useState<IssueCommentsState>({
    comments: [],
    issueId,
  });
  const comments =
    commentsState.issueId === issueId ? commentsState.comments : [];
  const [commentVisibility, setCommentVisibility] =
    useState<IssueCommentVisibility>({
      issueId,
      showAll: false,
    });
  const showAllComments =
    commentVisibility.issueId === issueId ? commentVisibility.showAll : false;
  const controllerRef = useRef<AbortController | null>(null);

  const getCommentsService = useAuthedService((token) =>
    IssueCommentsService.getInstanceForIssue(token, issue?.id ?? ''),
  );

  const loadComments = useCallback(async () => {
    if (!issue) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const service = await getCommentsService();
      const data = await service.list();
      if (!controller.signal.aborted) {
        setCommentsState({ comments: data, issueId });
      }
    } catch {
      if (!controller.signal.aborted) {
        setCommentsState({ comments: [], issueId });
      }
    }
  }, [getCommentsService, issue, issueId]);

  useEffect(() => {
    if (issue) {
      loadComments();
    }
    const controller = controllerRef.current;

    return () => {
      controller?.abort();
    };
  }, [issue, loadComments]);

  const visibleComments = useMemo(() => {
    const activeComments =
      commentsState.issueId === issueId ? commentsState.comments : [];
    const isShowAll =
      commentVisibility.issueId === issueId ? commentVisibility.showAll : false;
    return isShowAll || activeComments.length <= VISIBLE_COMMENT_COUNT
      ? activeComments
      : activeComments.slice(-VISIBLE_COMMENT_COUNT);
  }, [commentsState, commentVisibility, issueId]);

  const hiddenCommentCount = Math.max(
    0,
    comments.length - VISIBLE_COMMENT_COUNT,
  );

  const handleOpenDetail = useCallback(() => {
    if (issue) {
      push(`${APP_ROUTES.WORKSPACE.TASKS}/${issue.identifier}`);
      closeIssueOverlay();
    }
  }, [issue, push]);

  const statusBadge = useMemo(
    () =>
      issue ? (
        <Badge status={issue.status} size={ComponentSize.SM}>
          {STATUS_LABELS[issue.status]}
        </Badge>
      ) : null,
    [issue],
  );

  if (!issue) return null;

  return (
    <EntityOverlayShell
      id={ISSUE_OVERLAY_ID}
      title={issue.title}
      description={issue.identifier}
      badges={statusBadge}
      onOpenDetail={handleOpenDetail}
      openDetailLabel="Open full page"
      onClose={onClose}
      width="xl"
      surface="flat"
    >
      <div className="space-y-4 p-4">
        {issue.description && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-800">
              Description
            </h3>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {issue.description}
            </div>
          </div>
        )}

        {issue.linkedEntities?.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-800">
              <Link className="size-3.5" />
              Linked ({issue.linkedEntities.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {issue.linkedEntities.map((entity) => (
                <span
                  key={`${entity.entityModel}-${entity.entityId}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-2 py-1',
                    ENTITY_MODEL_COLORS[entity.entityModel],
                  )}
                >
                  {entity.entityModel === 'Ingredient' ? (
                    <Image className="size-3" />
                  ) : (
                    <FileText className="size-3" />
                  )}
                  <span className="text-2xs font-medium">
                    {ENTITY_MODEL_LABELS[entity.entityModel]}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-800">
            <MessageCircle className="size-3.5" />
            Comments ({comments.length})
          </h3>

          {comments.length > 0 ? (
            <div className="rounded border border-border">
              {!showAllComments && hiddenCommentCount > 0 && (
                <Button
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                  className="flex w-full items-center justify-center gap-1.5 border-b border-border py-2 text-2xs text-gray-800 transition-colors hover:bg-muted/40 hover:text-foreground"
                  onClick={() =>
                    setCommentVisibility({ issueId, showAll: true })
                  }
                >
                  <ChevronDown className="size-3" />
                  Show {hiddenCommentCount} earlier{' '}
                  {hiddenCommentCount === 1 ? 'comment' : 'comments'}
                </Button>
              )}
              {visibleComments.map((comment) => {
                const isAgent = comment.isAgentComment;
                return (
                  <div
                    key={comment.id}
                    className="border-b border-border px-3 py-2.5 last:border-b-0"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                          isAgent
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {isAgent ? (
                          <Cpu className="size-3" />
                        ) : (
                          <User className="size-3" />
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isAgent ? 'text-blue-400' : 'text-muted-foreground',
                        )}
                      >
                        {isAgent ? 'Agent' : 'User'}
                      </span>
                      <span className="text-2xs text-gray-800">
                        {getRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <div className="whitespace-pre-wrap pl-7 text-sm leading-relaxed text-foreground">
                      {comment.body}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded border border-dashed border-border py-4 text-center text-xs text-gray-800">
              No comments yet
            </div>
          )}
        </div>
      </div>
    </EntityOverlayShell>
  );
}
