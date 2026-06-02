export type IntegrationConnectionHealthStatus =
  | 'disconnected'
  | 'expired'
  | 'healthy'
  | 'refreshable'
  | 'refresh_exhausted';

export interface IntegrationCredentialHealthInput {
  accessToken?: string | null;
  accessTokenExpiry?: Date | string | null;
  isConnected?: boolean | null;
  isDeleted?: boolean | null;
  lastRefreshFailedAt?: Date | string | null;
  refreshAttempts?: number | null;
  refreshToken?: string | null;
  refreshTokenExpiry?: Date | string | null;
}

export interface IntegrationCredentialHealth {
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  reason: string;
  status: IntegrationConnectionHealthStatus;
}

export interface ResolveIntegrationCredentialHealthOptions {
  maxRefreshAttempts?: number;
  now?: Date;
}

function isExpired(
  value: Date | string | null | undefined,
  now: Date,
): boolean {
  if (!value) {
    return false;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) && date.getTime() <= now.getTime();
}

export function resolveIntegrationCredentialHealth(
  credential: IntegrationCredentialHealthInput,
  options: ResolveIntegrationCredentialHealthOptions = {},
): IntegrationCredentialHealth {
  const now = options.now ?? new Date();
  const maxRefreshAttempts = options.maxRefreshAttempts ?? 3;
  const hasAccessToken = Boolean(credential.accessToken);
  const hasRefreshToken = Boolean(credential.refreshToken);
  const refreshAttempts = credential.refreshAttempts ?? 0;

  if (credential.isDeleted || credential.isConnected === false) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Credential is disconnected or deleted.',
      status: 'disconnected',
    };
  }

  if (refreshAttempts >= maxRefreshAttempts && credential.lastRefreshFailedAt) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Refresh attempts are exhausted.',
      status: 'refresh_exhausted',
    };
  }

  if (isExpired(credential.refreshTokenExpiry, now)) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Refresh token is expired.',
      status: 'refresh_exhausted',
    };
  }

  if (isExpired(credential.accessTokenExpiry, now)) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: hasRefreshToken
        ? 'Access token is expired and can be refreshed.'
        : 'Access token is expired and no refresh token is available.',
      status: hasRefreshToken ? 'refreshable' : 'expired',
    };
  }

  if (!hasAccessToken && !hasRefreshToken) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'No usable tokens are stored.',
      status: 'disconnected',
    };
  }

  return {
    hasAccessToken,
    hasRefreshToken,
    reason: 'Credential has usable token material.',
    status: 'healthy',
  };
}
