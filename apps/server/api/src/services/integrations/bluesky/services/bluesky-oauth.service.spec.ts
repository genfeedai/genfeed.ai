import { BlueskyOAuthService } from '@api/services/integrations/bluesky/services/bluesky-oauth.service';
import { JoseKey } from '@atproto/oauth-client-node';
import { beforeEach, describe, expect, it } from 'vitest';

describe('BlueskyOAuthService client metadata', () => {
  let service: BlueskyOAuthService;
  let privateJwk: Record<string, unknown>;

  beforeEach(async () => {
    const generated = await JoseKey.generate(['ES256'], 'key-1');
    const key = await JoseKey.fromJWK({
      ...generated.privateJwk,
      alg: 'ES256',
      key_ops: ['sign'],
    });
    privateJwk = { ...key.privateJwk };
    service = new BlueskyOAuthService(
      {
        get: (name: string) =>
          ({
            GENFEEDAI_API_PUBLIC_URL: 'https://api.genfeed.example/',
            GENFEEDAI_APP_URL: 'https://app.genfeed.example',
          })[name],
      } as never,
      { getKey: async () => key } as never,
      {} as never,
    );
  });

  it('is identified by the address it is served at', async () => {
    const metadata = await service.getClientMetadata();

    expect(metadata.client_id).toBe(
      'https://api.genfeed.example/v1/services/bluesky/client-metadata.json',
    );
  });

  it('sends the person back to the app page that finishes the connection', async () => {
    const metadata = await service.getClientMetadata();

    expect(metadata.redirect_uris).toEqual([
      'https://app.genfeed.example/oauth/bluesky',
    ]);
  });

  it('is a confidential client that holds its tokens with DPoP', async () => {
    const metadata = await service.getClientMetadata();

    expect(metadata).toMatchObject({
      application_type: 'web',
      dpop_bound_access_tokens: true,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'atproto transition:generic',
      token_endpoint_auth_method: 'private_key_jwt',
      token_endpoint_auth_signing_alg: 'ES256',
    });
  });

  it('publishes the public key and never the private half', async () => {
    const metadata = await service.getClientMetadata();
    // Serialised as Bluesky receives it.
    const published = JSON.parse(JSON.stringify(metadata)).jwks.keys[0];

    expect(published.kid).toBe('key-1');
    expect(published.x).toBe(privateJwk.x);
    expect(published).not.toHaveProperty('d');
  });
});
