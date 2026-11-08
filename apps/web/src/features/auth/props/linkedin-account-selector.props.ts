import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';

export interface LinkedInAccountSelectorProps {
  /** The unconnected, unidentified credential row this selection settles. */
  credentialId: string;
  /** Called once the chosen account has been persisted, with the account that was picked. */
  onConnected: (account: ConnectionAccount) => void;
  /**
   * Aborts the connection without saving. Shown as "Go back" in the error and
   * empty states and as "Cancel" beside the confirm button, when provided.
   */
  onBack?: () => void;
  onError?: (message: string) => void;
}
