import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
    return <AgentErrorMessage className="mx-3 mt-2" message={authError} />;
  }

  if (loadError && hasThreads) {
    return (
      <div className="mx-3 mt-2 space-y-2">
        <AgentErrorMessage message={loadError} />
        <Button
          withWrapper={false}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.XS}
          className="w-full"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    );
  }

  return null;
}
