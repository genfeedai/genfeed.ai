'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import type { IssueComment } from '@services/management/issue-comments.service';
import { HiOutlineCpuChip, HiOutlineUser } from 'react-icons/hi2';

type CommentItemProps = {
  comment: IssueComment;
};

export function CommentItem({ comment }: CommentItemProps) {
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
            <HiOutlineCpuChip className="size-3.5" />
          ) : (
            <HiOutlineUser className="size-3.5" />
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
