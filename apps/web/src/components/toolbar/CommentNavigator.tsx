'use client';

import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useHeaderCommentNavigation } from '@/hooks/useCommentNavigation';

/**
 * Comment navigation indicator
 */
export function CommentNavigator() {
  const { totalCount, unviewedCount, currentIndex, hasComments, goToPrevious, goToNext } =
    useHeaderCommentNavigation();

  if (!hasComments) return null;

  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={goToPrevious}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Previous comment</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="tabular-nums text-muted-foreground">
              {currentIndex > 0 ? `${currentIndex}/${totalCount}` : totalCount}
            </span>
            {unviewedCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {unviewedCount}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>
            {unviewedCount > 0
              ? `${unviewedCount} unread comment${unviewedCount > 1 ? 's' : ''}`
              : `${totalCount} comment${totalCount > 1 ? 's' : ''}`}
          </p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={goToNext}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>Next comment</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
