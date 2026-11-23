import type { ICredential } from '@genfeedai/contracts/interfaces';
import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';

export interface FacebookPageSelectorProps {
  /** The unconnected, unidentified credential row this selection settles. */
  credentialId: string;
  /** Called once the ticked Pages have been persisted, with the first one connected. */
  onConnected: (
    account: ConnectionAccount,
    credentials?: readonly ICredential[],
  ) => void;
  /**
   * Aborts the connection without saving. Shown as "Go back" in the error and
   * empty states and as "Cancel" beside the confirm button, when provided.
   */
  onBack?: () => void;
  onError?: (message: string) => void;
}
