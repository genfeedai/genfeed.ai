import { CredentialPlatform } from '@genfeedai/contracts';
import type { BrandDetailSocialConnection } from '@genfeedai/props/pages/brand-detail.props';
import { describe, expect, it } from 'vitest';
import {
  getAccountConnectionStatus,
  getConnectionInitials,
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
  it('returns connected for a live account with an identity and no expiry', () => {
    expect(getAccountConnectionStatus(buildConnection())).toBe('connected');
  });

  it('returns needsReconnect when the credential is disconnected but not deleted', () => {
    expect(
      getAccountConnectionStatus(buildConnection({ isConnected: false })),
    ).toBe('needsReconnect');
  });

  it('returns needsReconnect when the access token has expired', () => {
    expect(
      getAccountConnectionStatus(
        buildConnection({ accessTokenExpiry: '2020-01-01T00:00:00.000Z' }),
      ),
    ).toBe('needsReconnect');
  });

  it('returns needsReconnect when there is no externalId identity', () => {
    expect(
      getAccountConnectionStatus(buildConnection({ externalId: undefined })),
    ).toBe('needsReconnect');
  });

  it('treats a missing accessTokenExpiry as not expired', () => {
    expect(
      isAccessTokenExpired(
        buildConnection({ accessTokenExpiry: undefined }).accessTokenExpiry,
      ),
    ).toBe(false);
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

  it('defaults isConnected to true for legacy callers that never set it', () => {
    expect(
      getAccountConnectionStatus(buildConnection({ isConnected: undefined })),
    ).toBe('connected');
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

describe('getConnectionInitials', () => {
  it('builds initials from up to two words in the label', () => {
    expect(
      getConnectionInitials(buildConnection({ name: 'Acme Studio' })),
    ).toBe('AS');
  });

  it('takes a single initial from a one-word label, such as the platform fallback', () => {
    // No name/label/handle — getConnectionLabel falls back to the platform
    // itself ("twitter"), a single word, so only its first letter is used.
    expect(
      getConnectionInitials(
        buildConnection({
          handle: undefined,
          label: undefined,
          name: undefined,
        }),
      ),
    ).toBe('T');
  });
});
