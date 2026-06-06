import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

interface AgentThreadListErrorBannerProps {
  authError: string | null;
  loadError: string | null;
  hasThreads: boolean;
  onRetry: () => void;
}

export function AgentThreadListErrorBanner({
  authError,
  loadError,
  hasThreads,
  onRetry,
}: AgentThreadListErrorBannerProps): ReactElement | null {
  if (authError) {
    return (
      <div className="mx-3 mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
        {authError}
      </div>
    );
  }

  if (loadError && hasThreads) {
    return (
      <div className="mx-3 mt-2 rounded-md border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
        <div className="flex items-center justify-between gap-2">
          <span>{loadError}</span>
          <Button
            withWrapper={false}
            variant={ButtonVariant.OUTLINE}
            className="h-7 px-2 text-[11px]"
            onClick={onRetry}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
