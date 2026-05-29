import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';

interface AgentThreadListEmptyStateProps {
  isLoading: boolean;
  shouldShowLoadFailureState: boolean;
  shouldShowEmptyState: boolean;
  onRetry: () => void;
}

export function AgentThreadListEmptyState({
  isLoading,
  shouldShowLoadFailureState,
  shouldShowEmptyState,
  onRetry,
}: AgentThreadListEmptyStateProps): ReactElement | null {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (shouldShowLoadFailureState) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-orange-500/10 ring-1 ring-inset ring-orange-500/20">
          <HiOutlineExclamationTriangle className="size-5 text-orange-200/80" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground/70">
            Failed to load threads
          </p>
          <p className="text-xs text-foreground/40">
            Check your connection and try again.
          </p>
        </div>
        <Button
          withWrapper={false}
          variant={ButtonVariant.OUTLINE}
          className="h-8 px-3 text-xs"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (shouldShowEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/10">
          <HiOutlineChatBubbleLeftRight className="size-5 text-foreground/30" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground/50">No threads</p>
          <p className="mt-0.5 text-xs text-foreground/30">
            Start one to get going
          </p>
        </div>
      </div>
    );
  }

  return null;
}
