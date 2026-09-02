import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

import { AgentErrorMessage } from './AgentErrorMessage';

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
      <AgentErrorMessage
        className="mx-3 mt-2 rounded-md border-destructive/20 bg-destructive/10 text-xs text-destructive"
        message={authError}
      />
    );
  }

  if (loadError && hasThreads) {
    return (
      <div className="mx-3 mt-2 space-y-2">
        <AgentErrorMessage className="rounded-md text-xs" message={loadError} />
        <Button
          withWrapper={false}
          variant={ButtonVariant.SECONDARY}
          className="h-7 w-full px-2 text-2xs"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  return null;
}
