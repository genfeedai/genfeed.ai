import { resolveIntegrationCredentialHealth } from './index';

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
});
