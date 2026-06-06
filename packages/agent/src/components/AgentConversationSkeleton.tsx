import { cn } from '@helpers/formatting/cn/cn.util';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import type { ReactElement } from 'react';

type AgentConversationSkeletonProps = {
  isWideLayout?: boolean;
  title?: string | null;
};

export function AgentConversationSkeleton({
  isWideLayout = false,
  title,
}: AgentConversationSkeletonProps): ReactElement {
  const conversationColumnMaxWidthClass = isWideLayout
    ? 'max-w-[52rem]'
    : 'max-w-[46rem]';

  return (
    <div
      className="relative flex min-h-full flex-1 flex-col"
      data-testid="conversation-skeleton"
    >
      <div className="flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto flex w-full flex-col px-4 py-5 pb-56 md:px-6 md:pb-72',
            conversationColumnMaxWidthClass,
          )}
        >
          <div className="mb-8 px-1">
            {title ? (
              <p className="truncate text-sm font-medium text-foreground/70">
                {title}
              </p>
            ) : (
              <Skeleton className="h-4 w-28 rounded-full bg-white/[0.04]" />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-12 pt-1">
            <div className="flex justify-end">
              <Skeleton className="h-10 w-40 rounded-md bg-white/[0.05]" />
            </div>

            <div className="max-w-[40rem] space-y-3 pt-2">
              <Skeleton className="h-4 w-[78%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[74%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[60%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[76%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[66%] rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-[52%] rounded-full bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </div>

      <PromptBarContainer
        layoutMode="surface-fixed"
        maxWidth="4xl"
        showTopFade
        zIndex={10}
        className="bottom-3 md:bottom-5"
      >
        <div className="rounded-md border border-white/[0.08] bg-background/80 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <Skeleton className="mb-4 h-5 w-28 rounded-full bg-white/[0.04]" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-full bg-white/[0.04]" />
              <Skeleton className="h-4 w-40 rounded-full bg-white/[0.04]" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-16 rounded-full bg-white/[0.04]" />
              <Skeleton className="size-8 rounded-full bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </PromptBarContainer>
    </div>
  );
}
