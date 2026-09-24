import { describe, expect, it } from 'vitest';

import { isBootstrapCredentialWrite } from './brand-bootstrap-credentials.util';

describe('isBootstrapCredentialWrite', () => {
  it.each([
    [{ isConnected: false }],
    [{ isDeleted: true }],
    [{ externalHandle: 'acme', externalId: 'provider-1' }],
    [{ accessToken: 'token', accessTokenExpiry: new Date() }],
    [{ label: 'Main account' }],
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
