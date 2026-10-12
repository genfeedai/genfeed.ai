import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  ActionRecovery,
  ActionRouting,
} from '@genfeedai/contracts/interfaces/extension/extension-action-routing.interface';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { usePanelNavigationStore } from '~store/use-panel-navigation-store';

/** Says out loud that a local provider, not Genfeed cloud, wrote this result. */
export function RoutingNotice({
  routing,
}: {
  routing: ActionRouting | null;
}): ReactElement | null {
  if (!routing) return null;
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {routing.notice}
    </p>
  );
}

/** What to do after a failed action: run the same request again, or check the provider settings. */
export function RecoveryActions({
  onRetry,
  recovery,
}: {
  onRetry: () => void;
  recovery: ActionRecovery | null;
}): ReactElement | null {
  if (!recovery || (!recovery.canRetry && !recovery.canOpenProviderSettings)) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {recovery.canRetry ? (
        <Button
          type="button"
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={onRetry}
        >
          {recovery.retryTarget === 'local'
            ? 'Retry with local provider'
            : 'Retry'}
        </Button>
      ) : null}
      {recovery.canOpenProviderSettings ? (
        <Button
          type="button"
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          onClick={() =>
            usePanelNavigationStore.getState().requestTab('settings')
          }
        >
          Provider settings
        </Button>
      ) : null}
    </div>
  );
}
