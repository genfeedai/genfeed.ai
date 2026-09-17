export const EXTERNAL_CONNECTION_STATES = [
  'pending',
  'authorized',
  'denied',
  'failed',
  'expired',
] as const;

export type ExternalConnectionState =
  (typeof EXTERNAL_CONNECTION_STATES)[number];

export const EXTERNAL_CONNECTION_RECOVERY_ACTIONS = [
  'retry',
  'configure_provider',
  'select_brand',
  'none',
] as const;

export type ExternalConnectionRecoveryAction =
  (typeof EXTERNAL_CONNECTION_RECOVERY_ACTIONS)[number];

/**
 * Durable social-connection request returned to MCP, CLI, and the in-app agent.
 * The authorization URL is a Genfeed browser page and never includes tokens.
 */
export interface ExternalConnectionRequest {
  accountId?: string | null;
  authorizationUrl: string;
  brandId: string;
  connectionId: string;
  expiresAt: string;
  externalHandle?: string | null;
  platform: string;
  recoveryAction: ExternalConnectionRecoveryAction;
  state: ExternalConnectionState;
}

export interface ExternalBrandOption {
  id: string;
  label: string;
}
