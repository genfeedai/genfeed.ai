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

  it('falls back to the platform when the label has no letters', () => {
    expect(
      getConnectionInitials(
        buildConnection({
          handle: undefined,
          label: undefined,
          name: undefined,
        }),
      ),
    ).toBe('TW');
  });
});
