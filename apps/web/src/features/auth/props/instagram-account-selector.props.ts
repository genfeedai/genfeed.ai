import type { ICredential } from '@genfeedai/contracts/interfaces';
import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';

export interface InstagramAccountSelectorProps {
  /** The unconnected, unidentified credential row this selection settles. */
  credentialId: string;
  /** Called after selection, with the first account's display details and the connected credentials. */
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
