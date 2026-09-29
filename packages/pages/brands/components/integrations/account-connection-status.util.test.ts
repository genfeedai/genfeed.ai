import { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import { describe, expect, it } from 'vitest';
import {
  getAccountConnectionStatus,
  getConnectionLabel,
  isAccessTokenExpired,
} from './account-connection-status.util';

function buildConnection(
  overrides: Partial<BrandDetailSocialConnection> = {},
): BrandDetailSocialConnection {
  return {
    credentialId: 'cred-1',
    externalId: 'ext-1',
    isConnected: true,
    platform: CredentialPlatform.TWITTER,
    ...overrides,
  };
}

describe('getAccountConnectionStatus', () => {
  it('returns needsReconnect when the access token has expired', () => {
    expect(
      getAccountConnectionStatus(
        buildConnection({ accessTokenExpiry: '2020-01-01T00:00:00.000Z' }),
      ),
    ).toBe('needsReconnect');
  });

  it('treats a malformed accessTokenExpiry as expired, not valid', () => {
    // `new Date('not-a-real-date').getTime()` is NaN — that must read as
    // needing reconnect, not as a token with no known expiry.
    expect(isAccessTokenExpired('not-a-real-date')).toBe(true);
    expect(
      getAccountConnectionStatus(
        buildConnection({ accessTokenExpiry: 'not-a-real-date' }),
      ),
    ).toBe('needsReconnect');
  });
});

describe('getConnectionLabel', () => {
  it('prefers name, then label, then handle, then platform', () => {
    expect(getConnectionLabel(buildConnection({ name: 'Acme' }))).toBe('Acme');
    expect(
      getConnectionLabel(
        buildConnection({ label: 'Acme Label', name: undefined }),
      ),
    ).toBe('Acme Label');
    expect(
      getConnectionLabel(
        buildConnection({ handle: 'acme', label: undefined, name: undefined }),
      ),
    ).toBe('acme');
    expect(
      getConnectionLabel(
        buildConnection({
          handle: undefined,
          label: undefined,
          name: undefined,
        }),
      ),
    ).toBe(CredentialPlatform.TWITTER);
  });
});
