import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';

export interface InstagramAccountSelectorProps {
  /** The unconnected, unidentified credential row this selection settles. */
  credentialId: string;
  /** Called once the ticked accounts have been persisted, with the first one connected. */
  onConnected: (account: ConnectionAccount) => void;
  /**
   * Aborts the connection without saving. Shown as "Go back" in the error and
   * empty states and as "Cancel" beside the confirm button, when provided.
   */
  onBack?: () => void;
  onError?: (message: string) => void;
}
