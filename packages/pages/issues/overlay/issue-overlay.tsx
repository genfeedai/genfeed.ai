'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { closeModal, openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type IssueComment,
  IssueCommentsService,
} from '@services/management/issue-comments.service';
import type {
  Issue,
  IssueLinkedEntityModel,
  IssueStatus,
} from '@services/management/issues.service';
import Button from '@ui/buttons/base/Button';
import EntityOverlayShell from '@ui/overlays/entity/EntityOverlayShell';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiChevronDown,
  HiOutlineChatBubbleLeft,
  HiOutlineCpuChip,
  HiOutlineDocumentText,
  HiOutlineLink,
  HiOutlinePhoto,
  HiOutlineUser,
} from 'react-icons/hi2';

const OVERLAY_ID = 'issue-overlay';
const VISIBLE_COMMENT_COUNT = 3;

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

export function openIssueOverlay(): void {
  openModal(OVERLAY_ID);
}

export function closeIssueOverlay(): void {
  closeModal(OVERLAY_ID);
}

interface IssueOverlayProps {
  issue: Issue | null;
  onClose?: () => void;
}

export default function IssueOverlay({ issue, onClose }: IssueOverlayProps) {
  const router = useRouter();
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [showAllComments, setShowAllComments] = useState(false);
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
        setComments(data);
      }
    } catch {
      if (!controller.signal.aborted) {
        setComments([]);
      }
    }
  }, [getCommentsService, issue]);

  useEffect(() => {
    if (issue) {
      setShowAllComments(false);
      loadComments();
    }

    return () => {
      controllerRef.current?.abort();
    };
  }, [issue, loadComments]);

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

  const handleOpenDetail = useCallback(() => {
    if (issue) {
      router.push(`/issues/${issue.identifier}`);
      closeIssueOverlay();
    }
  }, [issue, router]);

  if (!issue) return null;

  return (
    <EntityOverlayShell
      id={OVERLAY_ID}
      title={issue.title}
      description={issue.identifier}
      badges={
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            STATUS_COLORS[issue.status],
          )}
        >
          {STATUS_LABELS[issue.status]}
        </span>
      }
      onOpenDetail={handleOpenDetail}
      openDetailLabel="Open full page"
      onClose={onClose}
      width="xl"
      surface="gradient"
    >
      <div className="space-y-4 p-4">
        {issue.description && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              Description
            </h3>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
              {issue.description}
            </div>
          </div>
        )}

        {issue.linkedEntities?.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
              <HiOutlineLink className="h-3.5 w-3.5" />
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
                    <HiOutlinePhoto className="h-3 w-3" />
                  ) : (
                    <HiOutlineDocumentText className="h-3 w-3" />
                  )}
                  <span className="text-[10px] font-medium">
                    {ENTITY_MODEL_LABELS[entity.entityModel]}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
            <HiOutlineChatBubbleLeft className="h-3.5 w-3.5" />
            Comments ({comments.length})
          </h3>

          {comments.length > 0 ? (
            <div className="rounded border border-white/5">
              {!showAllComments && hiddenCommentCount > 0 && (
                <Button
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                  className="flex w-full items-center justify-center gap-1.5 border-b border-white/5 py-2 text-[11px] text-white/40 transition-colors hover:bg-white/[0.02] hover:text-white/60"
                  onClick={() => setShowAllComments(true)}
                >
                  <HiChevronDown className="h-3 w-3" />
                  Show {hiddenCommentCount} earlier{' '}
                  {hiddenCommentCount === 1 ? 'comment' : 'comments'}
                </Button>
              )}
              {visibleComments.map((comment) => {
                const isAgent = comment.isAgentComment;
                return (
                  <div
                    key={comment.id}
                    className="border-b border-white/5 px-3 py-2.5 last:border-b-0"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <div
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                          isAgent
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-white/10 text-white/50',
                        )}
                      >
                        {isAgent ? (
                          <HiOutlineCpuChip className="h-3 w-3" />
                        ) : (
                          <HiOutlineUser className="h-3 w-3" />
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
                    <div className="whitespace-pre-wrap pl-7 text-sm leading-relaxed text-white/80">
                      {comment.body}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded border border-dashed border-white/10 py-4 text-center text-xs text-white/25">
              No comments yet
            </div>
          )}
        </div>
      </div>
    </EntityOverlayShell>
  );
}
