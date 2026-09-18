import { OAUTH_STATE_TTL_MS } from '@genfeedai/contracts/constants';
import {
  EXTERNAL_CONNECTION_DENIED_STATE,
  EXTERNAL_CONNECTION_FAILED_STATE,
  isReservedExternalConnectionOAuthState,
  oauthCallbackErrorState,
  resolveExternalConnectionState,
  serializeExternalConnectionRequest,
} from './external-connection-request.helper';

describe('external connection request helper', () => {
  const createdAt = new Date('2026-09-17T12:00:00.000Z');

  it('maps a live pending row to pending with an expiry window', () => {
    const request = serializeExternalConnectionRequest({
      authorizationUrl: 'https://app.genfeed.ai/acme/~/connect/social',
      brandId: 'brand-1',
      connectionId: 'cred-1',
      createdAt,
      isConnected: false,
      now: createdAt,
      platform: 'twitter',
    });

    expect(request.state).toBe('pending');
    expect(request.recoveryAction).toBe('none');
    expect(request.expiresAt).toBe(
      new Date(createdAt.getTime() + OAUTH_STATE_TTL_MS).toISOString(),
    );
    expect(request.authorizationUrl).not.toMatch(/token|secret|oauth_token/i);
  });

  it('maps a connected row to authorized without requiring another start', () => {
    expect(
      resolveExternalConnectionState({
        createdAt,
        isConnected: true,
        oauthState: 'abc',
      }),
    ).toBe('authorized');
  });

  it('maps provider denial and expiry without claiming a connection', () => {
    expect(
      resolveExternalConnectionState({
        createdAt,
        isConnected: false,
        oauthState: EXTERNAL_CONNECTION_DENIED_STATE,
      }),
    ).toBe('denied');
    expect(
      resolveExternalConnectionState({
        createdAt,
        isConnected: false,
        oauthState: EXTERNAL_CONNECTION_FAILED_STATE,
      }),
    ).toBe('failed');
    expect(
      resolveExternalConnectionState({
        createdAt,
        isConnected: false,
        now: new Date(createdAt.getTime() + OAUTH_STATE_TTL_MS + 1),
        oauthState: EXTERNAL_CONNECTION_DENIED_STATE,
      }),
    ).toBe('denied');
    expect(
      resolveExternalConnectionState({
        createdAt,
        isConnected: false,
        now: new Date(createdAt.getTime() + OAUTH_STATE_TTL_MS + 1),
      }),
    ).toBe('expired');
  });

  it('maps provider callback error codes onto durable denied or failed sentinels', () => {
    expect(oauthCallbackErrorState('access_denied')).toBe('denied');
    expect(oauthCallbackErrorState('user_denied')).toBe('denied');
    expect(oauthCallbackErrorState('server_error')).toBe('failed');
  });

  it('treats outcome sentinels as reserved so they cannot be used as OAuth nonces', () => {
    expect(isReservedExternalConnectionOAuthState('denied')).toBe(true);
    expect(isReservedExternalConnectionOAuthState('FAILED')).toBe(true);
    expect(isReservedExternalConnectionOAuthState('opaque-oauth-state')).toBe(
      false,
    );
  });
});
