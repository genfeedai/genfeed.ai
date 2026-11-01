import { describe, expect, it } from 'vitest';

import {
  isBootstrapCredentialWrite,
  mapBootstrapCredentials,
} from './brand-bootstrap-credentials.util';

describe('isBootstrapCredentialWrite', () => {
  it.each([
    [{ isConnected: false }],
    [{ isDeleted: true }],
    [{ externalHandle: 'acme', externalId: 'provider-1' }],
    [{ accessToken: 'token', accessTokenExpiry: new Date() }],
    [{ label: 'Main account' }],
    // A reconnect that grants dm.read changes the embedded DM verdict.
    [{ grantedScopes: ['dm.read'], grantedScopesCapturedAt: new Date() }],
  ])('flags a write to an embedded column: %o', (update) => {
    expect(isBootstrapCredentialWrite(update)).toBe(true);
  });

  it.each([
    [{ oauthState: 'state-1' }],
    [{ accessToken: 'token', refreshToken: 'refresh' }],
    [{ warmupSignals: { profileSignals: 2 } }],
    [{}],
  ])('ignores a write the bootstrap does not embed: %o', (update) => {
    expect(isBootstrapCredentialWrite(update)).toBe(false);
  });

  it('ignores non-object input', () => {
    expect(isBootstrapCredentialWrite(null)).toBe(false);
    expect(isBootstrapCredentialWrite(undefined)).toBe(false);
  });
});

describe('mapBootstrapCredentials', () => {
  it('embeds the X DM verdict instead of the raw scope list', () => {
    const [credential] = mapBootstrapCredentials([
      {
        grantedScopes: ['tweet.read', 'tweet.write', 'users.read'],
        grantedScopesCapturedAt: new Date('2026-10-20T00:00:00.000Z'),
        id: 'credential-x',
        platform: 'TWITTER',
      },
    ]);

    expect(credential).toEqual({
      directMessageCapability: 'reconnect',
      id: 'credential-x',
      platform: 'twitter',
    });
  });

  it('leaves the DM verdict unset for platforms without DM scopes', () => {
    const [credential] = mapBootstrapCredentials([
      {
        grantedScopes: ['w_member_social'],
        grantedScopesCapturedAt: new Date('2026-10-20T00:00:00.000Z'),
        id: 'credential-linkedin',
        platform: 'LINKEDIN',
      },
    ]);

    expect(credential).not.toHaveProperty('grantedScopes');
    expect(credential?.directMessageCapability).toBeUndefined();
  });
});
