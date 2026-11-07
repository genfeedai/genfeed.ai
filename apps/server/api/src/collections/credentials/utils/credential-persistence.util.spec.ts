import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import { pickCarriedConnectionColumns } from '@api/collections/credentials/utils/credential-persistence.util';

describe('pickCarriedConnectionColumns', () => {
  it('moves the business portfolio with the token so a reconnect keeps them together', () => {
    const carried = pickCarriedConnectionColumns({
      accessToken: 'business-token',
      externalBusinessId: 'business-1',
      label: 'Stays on the incumbent',
    } as unknown as CredentialDocument);

    expect(carried).toEqual({
      accessToken: 'business-token',
      externalBusinessId: 'business-1',
    });
  });

  it('carries an explicit null so a reconnect clears a stale portfolio', () => {
    const carried = pickCarriedConnectionColumns({
      accessToken: 'token',
      externalBusinessId: null,
    } as unknown as CredentialDocument);

    expect(carried).toEqual({ accessToken: 'token', externalBusinessId: null });
  });
});
