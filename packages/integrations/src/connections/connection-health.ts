import { buildPublishingProviderReadiness } from '@genfeedai/helpers';
import type { IPublishingProviderReadiness } from '@genfeedai/interfaces';

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

export interface CredentialTokenPublishingReadinessInput {
  accessToken?: string | null;
  accessTokenExpiresAt?: Date | string | null;
  accessTokenSecret?: string | null;
  credentialId: string;
  isConnected: boolean;
  now?: Date;
  oauthToken?: string | null;
  oauthTokenSecret?: string | null;
  providerKey: IPublishingProviderReadiness['providerKey'];
  refreshToken?: string | null;
  refreshTokenExpiresAt?: Date | string | null;
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
  const refreshIsExhausted =
    (refreshAttempts >= maxRefreshAttempts &&
      Boolean(credential.lastRefreshFailedAt)) ||
    isExpired(credential.refreshTokenExpiry, now);

  if (credential.isDeleted || credential.isConnected === false) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Credential is disconnected or deleted.',
      status: 'disconnected',
    };
  }

  if (!hasAccessToken) {
    if (!hasRefreshToken) {
      return {
        hasAccessToken,
        hasRefreshToken,
        reason: 'No usable tokens are stored.',
        status: 'disconnected',
      };
    }

    if (refreshIsExhausted) {
      return {
        hasAccessToken,
        hasRefreshToken,
        reason: 'Refresh credential is expired or exhausted.',
        status: 'refresh_exhausted',
      };
    }

    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Access token is missing and can be refreshed.',
      status: 'refreshable',
    };
  }

  if (!hasKnownExpiry(credential.accessTokenExpiry) && refreshIsExhausted) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Refresh credential is expired or exhausted.',
      status: 'refresh_exhausted',
    };
  }

  if (!isExpired(credential.accessTokenExpiry, now)) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Credential has usable token material.',
      status: 'healthy',
    };
  }

  if (!hasRefreshToken) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Access token is expired and no refresh token is available.',
      status: 'expired',
    };
  }

  if (refreshIsExhausted) {
    return {
      hasAccessToken,
      hasRefreshToken,
      reason: 'Refresh credential is expired or exhausted.',
      status: 'refresh_exhausted',
    };
  }

  return {
    hasAccessToken,
    hasRefreshToken,
    reason: 'Access token is expired and can be refreshed.',
    status: 'refreshable',
  };
}

function firstStoredToken(
  values: readonly (string | null | undefined)[],
): string | null {
  return (
    values.find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    ) ?? null
  );
}

function hasKnownExpiry(value: Date | string | null | undefined): boolean {
  if (!value) {
    return false;
  }

  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp);
}

export function buildCredentialTokenPublishingReadiness(
  input: CredentialTokenPublishingReadinessInput,
): IPublishingProviderReadiness {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const health = resolveIntegrationCredentialHealth(
    {
      accessToken: firstStoredToken([
        input.accessToken,
        input.accessTokenSecret,
        input.oauthToken,
        input.oauthTokenSecret,
      ]),
      accessTokenExpiry: input.accessTokenExpiresAt,
      isConnected: input.isConnected,
      refreshToken: input.refreshToken,
      refreshTokenExpiry: input.refreshTokenExpiresAt,
    },
    { now },
  );

  if (!input.isConnected) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      diagnostics: [
        {
          checkedAt,
          classification: 'expired_credential',
          code: 'credential_disconnected',
          correctiveAction: 'Reconnect the provider account before publishing.',
          isRetryable: true,
          message: 'The provider account is disconnected.',
          scope: 'credential',
          severity: 'error',
        },
      ],
      providerKey: input.providerKey,
      tokenFreshness: 'fail',
    });
  }

  if (!health.hasAccessToken) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      diagnostics: [
        {
          checkedAt,
          classification: 'expired_credential',
          code: 'credential_access_token_missing',
          correctiveAction: 'Reconnect the provider account before publishing.',
          isRetryable: true,
          message: 'The provider account has no usable access credential.',
          scope: 'credential',
          severity: 'error',
        },
      ],
      providerKey: input.providerKey,
      tokenFreshness: 'fail',
    });
  }

  if (!hasKnownExpiry(input.accessTokenExpiresAt)) {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      providerKey: input.providerKey,
      tokenFreshness: 'unknown',
    });
  }

  if (health.status === 'healthy') {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      providerKey: input.providerKey,
      tokenFreshness: 'pass',
    });
  }

  if (health.status === 'refreshable') {
    return buildPublishingProviderReadiness({
      credentialId: input.credentialId,
      diagnostics: [
        {
          checkedAt,
          classification: 'expired_credential',
          code: 'credential_access_token_refresh_required',
          correctiveAction:
            'Refresh the provider credential before the next publish attempt.',
          isRetryable: true,
          message:
            'The access token is expired, but a refresh credential is available.',
          scope: 'credential',
          severity: 'warning',
        },
      ],
      providerKey: input.providerKey,
      tokenFreshness: 'warn',
    });
  }

  return buildPublishingProviderReadiness({
    credentialId: input.credentialId,
    diagnostics: [
      {
        checkedAt,
        classification: 'expired_credential',
        code: 'credential_reconnect_required',
        correctiveAction: 'Reconnect the provider account before publishing.',
        isRetryable: true,
        message:
          'The provider credential is expired and cannot be refreshed safely.',
        scope: 'credential',
        severity: 'error',
      },
    ],
    providerKey: input.providerKey,
    tokenFreshness: 'fail',
  });
}
