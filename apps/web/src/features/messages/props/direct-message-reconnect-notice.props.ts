export interface DirectMessageReconnectAccount {
  readonly credentialId: string;
  readonly label: string;
}

export interface DirectMessageReconnectNoticeProps {
  /** X accounts whose stored grant has no DM scope. Renders nothing when empty. */
  readonly accounts: readonly DirectMessageReconnectAccount[];
  readonly isDisabled?: boolean;
  readonly onReconnect: (credentialId: string) => void;
  /** The account whose reconnect is starting; its button shows a spinner. */
  readonly reconnectingCredentialId?: string | null;
}
