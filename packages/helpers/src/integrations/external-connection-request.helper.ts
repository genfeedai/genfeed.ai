import { OAUTH_STATE_TTL_MS } from '@genfeedai/contracts/constants';
import type {
  ExternalConnectionRecoveryAction,
  ExternalConnectionRequest,
  ExternalConnectionState,
} from '@genfeedai/contracts/interfaces';

const DENIED_OAUTH_STATE = 'denied';
const FAILED_OAUTH_STATE = 'failed';

const PROVIDER_DENIED_ERROR_CODES = new Set(['access_denied', 'user_denied']);

export const EXTERNAL_CONNECTION_DENIED_STATE = DENIED_OAUTH_STATE;
export const EXTERNAL_CONNECTION_FAILED_STATE = FAILED_OAUTH_STATE;

export function oauthCallbackErrorState(
  error: string,
): Extract<ExternalConnectionState, 'denied' | 'failed'> {
  const code = error.trim().toLowerCase();
  return PROVIDER_DENIED_ERROR_CODES.has(code) ? 'denied' : 'failed';
}

export function resolveExternalConnectionState(input: {
  createdAt: Date | string;
  isConnected: boolean;
  now?: Date;
  oauthState?: string | null;
}): ExternalConnectionState {
  if (input.isConnected) {
    return 'authorized';
  }
  if (input.oauthState === DENIED_OAUTH_STATE) {
    return 'denied';
  }
  if (input.oauthState === FAILED_OAUTH_STATE) {
    return 'failed';
  }
  const createdAt = new Date(input.createdAt);
  const now = input.now ?? new Date();
  if (
    Number.isNaN(createdAt.getTime()) ||
    now.getTime() - createdAt.getTime() > OAUTH_STATE_TTL_MS
  ) {
    return 'expired';
  }
  return 'pending';
}

export function recoveryActionForState(
  state: ExternalConnectionState,
): ExternalConnectionRecoveryAction {
  switch (state) {
    case 'denied':
    case 'expired':
    case 'failed':
      return 'retry';
    case 'authorized':
    case 'pending':
      return 'none';
  }
}

export function serializeExternalConnectionRequest(input: {
  accountId?: string | null;
  authorizationUrl: string;
  brandId: string;
  connectionId: string;
  createdAt: Date | string;
  externalHandle?: string | null;
  isConnected: boolean;
  oauthState?: string | null;
  platform: string;
  now?: Date;
}): ExternalConnectionRequest {
  const state = resolveExternalConnectionState(input);
  const createdAt = new Date(input.createdAt);
  const expiresAt = Number.isNaN(createdAt.getTime())
    ? new Date().toISOString()
    : new Date(createdAt.getTime() + OAUTH_STATE_TTL_MS).toISOString();

  return {
    accountId: input.accountId ?? null,
    authorizationUrl: input.authorizationUrl,
    brandId: input.brandId,
    connectionId: input.connectionId,
    expiresAt,
    externalHandle: input.externalHandle ?? null,
    platform: input.platform,
    recoveryAction: recoveryActionForState(state),
    state,
  };
}
