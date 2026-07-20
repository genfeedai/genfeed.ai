import {
  buildCredentialTokenPublishingReadiness,
  resolveIntegrationCredentialHealth,
} from './index';

describe('integration credential health', () => {
  const now = new Date('2026-06-02T00:00:00.000Z');

  it('marks usable token material healthy', () => {
    expect(
      resolveIntegrationCredentialHealth(
        {
          accessToken: 'encrypted-access',
          accessTokenExpiry: '2026-06-03T00:00:00.000Z',
          isConnected: true,
        },
        { now },
      ),
    ).toMatchObject({
      hasAccessToken: true,
      status: 'healthy',
    });
  });

  it('marks expired access tokens with refresh material refreshable', () => {
    expect(
      resolveIntegrationCredentialHealth(
        {
          accessToken: 'encrypted-access',
          accessTokenExpiry: '2026-06-01T00:00:00.000Z',
          isConnected: true,
          refreshToken: 'encrypted-refresh',
        },
        { now },
      ),
    ).toMatchObject({
      hasRefreshToken: true,
      status: 'refreshable',
    });
  });

  it('marks deleted or disconnected credentials disconnected', () => {
    expect(
      resolveIntegrationCredentialHealth({
        accessToken: 'encrypted-access',
        isConnected: false,
      }),
    ).toMatchObject({
      status: 'disconnected',
    });
  });

  it('marks exhausted refresh attempts as refresh exhausted', () => {
    expect(
      resolveIntegrationCredentialHealth(
        {
          accessToken: 'encrypted-access',
          lastRefreshFailedAt: '2026-06-01T23:00:00.000Z',
          refreshAttempts: 3,
          refreshToken: 'encrypted-refresh',
        },
        { maxRefreshAttempts: 3, now },
      ),
    ).toMatchObject({
      status: 'refresh_exhausted',
    });
  });

  it('does not block a live access token when its refresh token is expired', () => {
    expect(
      resolveIntegrationCredentialHealth(
        {
          accessToken: 'encrypted-access',
          accessTokenExpiry: '2026-06-03T00:00:00.000Z',
          isConnected: true,
          refreshToken: 'encrypted-refresh',
          refreshTokenExpiry: '2026-06-01T00:00:00.000Z',
        },
        { now },
      ),
    ).toMatchObject({
      status: 'healthy',
    });
  });

  it('projects an unexpired credential as publish capable', () => {
    const readiness = buildCredentialTokenPublishingReadiness({
      accessToken: 'encrypted-access',
      accessTokenExpiresAt: '2026-06-03T00:00:00.000Z',
      credentialId: 'cred-1',
      isConnected: true,
      now,
      providerKey: 'twitter',
      refreshToken: 'encrypted-refresh',
    });

    expect(readiness).toMatchObject({
      canSchedule: true,
      credentialId: 'cred-1',
      diagnostics: [],
      state: 'publish_capable',
      tokenFreshness: 'pass',
    });
    expect(readiness).not.toHaveProperty('lastSuccessfulValidationAt');
    expect(readiness).not.toHaveProperty('lastValidationAttemptAt');
  });

  it('blocks a disconnected credential with a reconnect action', () => {
    const readiness = buildCredentialTokenPublishingReadiness({
      accessToken: 'encrypted-access',
      credentialId: 'cred-1',
      isConnected: false,
      now,
      providerKey: 'twitter',
      refreshToken: 'encrypted-refresh',
    });

    expect(readiness).toMatchObject({
      canSchedule: false,
      isRetryable: true,
      requiredAction: 'Reconnect the provider account before publishing.',
      state: 'blocked',
      tokenFreshness: 'fail',
    });
    expect(readiness.diagnostics[0]?.code).toBe('credential_disconnected');
  });

  it('blocks a connected credential when access token material is absent', () => {
    const readiness = buildCredentialTokenPublishingReadiness({
      accessTokenExpiresAt: '2026-06-03T00:00:00.000Z',
      credentialId: 'cred-1',
      isConnected: true,
      now,
      providerKey: 'twitter',
      refreshToken: 'encrypted-refresh',
    });

    expect(readiness).toMatchObject({
      canSchedule: false,
      requiredAction: 'Reconnect the provider account before publishing.',
      state: 'blocked',
      tokenFreshness: 'fail',
    });
    expect(readiness.diagnostics[0]?.code).toBe(
      'credential_access_token_missing',
    );
  });

  it('checks all supported access-token fields independently', () => {
    const readiness = buildCredentialTokenPublishingReadiness({
      accessToken: '',
      accessTokenExpiresAt: '2026-06-03T00:00:00.000Z',
      credentialId: 'cred-1',
      isConnected: true,
      now,
      oauthToken: 'encrypted-oauth-token',
      providerKey: 'twitter',
    });

    expect(readiness).toMatchObject({
      state: 'publish_capable',
      tokenFreshness: 'pass',
    });
  });

  it('keeps an expired access token retryable when refresh is available', () => {
    const readiness = buildCredentialTokenPublishingReadiness({
      accessToken: 'encrypted-access',
      accessTokenExpiresAt: '2026-06-01T00:00:00.000Z',
      credentialId: 'cred-1',
      isConnected: true,
      now,
      providerKey: 'twitter',
      refreshToken: 'encrypted-refresh',
      refreshTokenExpiresAt: '2026-06-03T00:00:00.000Z',
    });

    expect(readiness).toMatchObject({
      canSchedule: true,
      isRetryable: true,
      state: 'degraded',
      tokenFreshness: 'warn',
    });
    expect(readiness.diagnostics[0]?.code).toBe(
      'credential_access_token_refresh_required',
    );
  });

  it('blocks an expired credential without a usable refresh path', () => {
    const readiness = buildCredentialTokenPublishingReadiness({
      accessToken: 'encrypted-access',
      accessTokenExpiresAt: '2026-06-01T00:00:00.000Z',
      credentialId: 'cred-1',
      isConnected: true,
      now,
      providerKey: 'twitter',
      refreshToken: 'encrypted-refresh',
      refreshTokenExpiresAt: '2026-06-01T00:00:00.000Z',
    });

    expect(readiness).toMatchObject({
      canSchedule: false,
      isRetryable: true,
      state: 'blocked',
      tokenFreshness: 'fail',
    });
    expect(readiness.diagnostics[0]?.code).toBe(
      'credential_reconnect_required',
    );
  });

  it('keeps missing expiry metadata explicit without blocking scheduling', () => {
    const readiness = buildCredentialTokenPublishingReadiness({
      accessToken: 'encrypted-access',
      credentialId: 'cred-1',
      isConnected: true,
      now,
      providerKey: 'twitter',
    });

    expect(readiness).toMatchObject({
      canSchedule: true,
      diagnostics: [],
      state: 'publish_capable',
      tokenFreshness: 'unknown',
    });
  });
});
