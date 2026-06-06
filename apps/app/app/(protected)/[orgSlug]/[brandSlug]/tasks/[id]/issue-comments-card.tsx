'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IssueComment } from '@services/management/issue-comments.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import type { RefObject } from 'react';
import {
  HiChevronDown,
  HiOutlineChatBubbleLeft,
  HiOutlineChevronDoubleDown,
} from 'react-icons/hi2';
import { CommentItem } from './comment-item';

type IssueCommentsCardProps = {
  comments: IssueComment[];
  visibleComments: IssueComment[];
  hiddenCommentCount: number;
  showAllComments: boolean;
  commentBody: string;
  isSubmitting: boolean;
  lastCommentRef: RefObject<HTMLDivElement | null>;
  visibleCommentCount: number;
  onShowAllComments: () => void;
  onScrollToLatest: () => void;
  onCommentBodyChange: (value: string) => void;
  onAddComment: () => Promise<void>;
};

export default function IssueCommentsCard({
  comments,
  visibleComments,
  hiddenCommentCount,
  showAllComments,
  commentBody,
  isSubmitting,
  lastCommentRef,
  visibleCommentCount,
  onShowAllComments,
  onScrollToLatest,
  onCommentBodyChange,
  onAddComment,
}: IssueCommentsCardProps) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/40">
          <HiOutlineChatBubbleLeft className="size-3.5" />
          Comments ({comments.length})
        </h3>
        {comments.length > visibleCommentCount && (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300"
            onClick={onScrollToLatest}
          >
            <HiOutlineChevronDoubleDown className="size-3" />
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
              onClick={onShowAllComments}
            >
              <HiChevronDown className="size-3" />
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
          onChange={(e) => onCommentBodyChange(e.target.value)}
          placeholder="Write a comment..."
          rows={3}
          value={commentBody}
        />
        <Button
          variant={ButtonVariant.SOFT}
          size={ButtonSize.SM}
          disabled={isSubmitting || !commentBody.trim()}
          onClick={onAddComment}
          type="button"
        >
          {isSubmitting ? 'Posting...' : 'Add Comment'}
        </Button>
      </div>
    </Card>
  );
}
