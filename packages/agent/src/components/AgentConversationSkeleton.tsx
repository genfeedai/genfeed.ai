import { Skeleton } from '@ui/display/skeleton/skeleton';
import PromptBarContainer from '@ui/layout/prompt-bar-container/PromptBarContainer';
import PromptBarComposer from '@ui/prompt-bars/components/shell/PromptBarComposer';
import PromptBarToolbar from '@ui/prompt-bars/components/toolbar/PromptBarToolbar';
import type { ReactElement } from 'react';

type AgentConversationSkeletonProps = {
  isWideLayout?: boolean;
  title?: string | null;
};

export function AgentConversationSkeleton({
  title,
}: AgentConversationSkeletonProps): ReactElement {
  // Full-width scroll (window-edge scrollbar); content track is max-w-3xl.
  return (
    <div
      className="relative flex min-h-full w-full flex-1 flex-col"
      data-testid="conversation-skeleton"
    >
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col px-3 py-5 pb-36 sm:px-4 md:pb-40">
          <div className="mb-8 px-1">
            {title ? (
              <p className="truncate text-sm font-medium text-foreground/70">
                {title}
              </p>
            ) : (
              <Skeleton className="h-4 w-28 rounded-full bg-foreground/[0.04]" />
            )}
          </div>

          <div className="flex flex-1 flex-col gap-12 pt-1">
            <div className="flex justify-start">
              <Skeleton className="h-16 w-full rounded-xl bg-foreground/[0.05]" />
            </div>

            <div className="max-w-[40rem] space-y-3 pt-2">
              <Skeleton className="h-4 w-[78%] rounded-full bg-foreground/[0.04]" />
              <Skeleton className="h-4 w-[74%] rounded-full bg-foreground/[0.04]" />
              <Skeleton className="h-4 w-[60%] rounded-full bg-foreground/[0.04]" />
              <Skeleton className="h-4 w-[76%] rounded-full bg-foreground/[0.04]" />
              <Skeleton className="h-4 w-[66%] rounded-full bg-foreground/[0.04]" />
              <Skeleton className="h-4 w-[52%] rounded-full bg-foreground/[0.04]" />
            </div>
          </div>
        </div>
      </div>

      <PromptBarContainer
        className="bottom-0 w-full"
        layoutMode="surface-fixed"
        maxWidth="full"
        showTopFade={false}
        zIndex={40}
      >
        <PromptBarComposer>
          <Skeleton className="my-2 h-5 w-28 rounded-full bg-foreground/[0.04]" />
          <PromptBarToolbar
            leading={
              <>
                <Skeleton className="size-8 rounded-full bg-foreground/[0.04]" />
                <Skeleton className="h-4 w-40 rounded-full bg-foreground/[0.04]" />
              </>
            }
            trailing={
              <>
                <Skeleton className="h-4 w-16 rounded-full bg-foreground/[0.04]" />
                <Skeleton className="size-9 rounded-full bg-foreground/[0.04]" />
              </>
            }
          />
        </PromptBarComposer>
      </PromptBarContainer>
    </div>
  );
}
