export interface InstagramAccountSelectorProps {
  /** The unconnected, unidentified credential row this selection settles. */
  credentialId: string;
  /** Called once the chosen account has been persisted. */
  onConnected: () => void;
  /** Shown as a "Go back" action in the error and empty states, when provided. */
  onBack?: () => void;
  onError?: (message: string) => void;
}
