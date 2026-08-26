'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import type { IssueComment } from '@services/management/issue-comments.service';
import { Cpu, User } from 'lucide-react';

type CommentItemProps = {
  comment: IssueComment;
};

export function CommentItem({ comment }: CommentItemProps) {
  const isAgent = comment.isAgentComment;

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="mb-1.5 flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
            isAgent
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {isAgent ? (
            <Cpu className="size-3.5" />
          ) : (
            <User className="size-3.5" />
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
      <div className="whitespace-pre-wrap pl-[34px] text-sm leading-relaxed text-foreground">
        {comment.body}
      </div>
    </div>
  );
}
