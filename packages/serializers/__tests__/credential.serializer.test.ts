import { CredentialPlatform } from '@genfeedai/contracts';
import { CredentialSerializer } from '@serializers/server/organizations/credential.serializer';
import { describe, expect, it } from 'vitest';

describe('CredentialSerializer', () => {
  it('emits domain lowercase platform for a Prisma SCREAMING row', () => {
    const output = CredentialSerializer.serialize({
      id: 'cred-1',
      isDeleted: false,
      label: 'Launch account',
      platform: 'TWITTER',
    }) as {
      data: { attributes: { platform?: string }; id: string; type: string };
    };

    expect(output.data.type).toBe('credential');
    expect(output.data.id).toBe('cred-1');
    expect(output.data.attributes.platform).toBe(CredentialPlatform.TWITTER);
    expect(output.data.attributes.platform).toBe('twitter');
  });

  it('never serializes OAuth 1.0a token secrets', () => {
    const output = CredentialSerializer.serialize({
      accessToken: 'access-token',
      accessTokenSecret: 'access-token-secret',
      id: 'cred-1',
      oauthToken: 'request-token',
      oauthTokenSecret: 'request-token-secret',
      platform: 'X_ADS',
    }) as { data: { attributes: Record<string, unknown> } };

    expect(output.data.attributes).not.toHaveProperty('accessToken');
    expect(output.data.attributes).not.toHaveProperty('accessTokenSecret');
    expect(output.data.attributes).not.toHaveProperty('oauthToken');
    expect(output.data.attributes).not.toHaveProperty('oauthTokenSecret');
  });

  it('maps a collection of Prisma-shaped credentials', () => {
    const output = CredentialSerializer.serialize([
      { id: 'cred-1', platform: 'INSTAGRAM' },
      { id: 'cred-2', platform: 'DEVTO' },
    ]) as {
      data: Array<{ attributes: { platform?: string } }>;
    };

    expect(output.data[0]?.attributes.platform).toBe(
      CredentialPlatform.INSTAGRAM,
    );
    expect(output.data[1]?.attributes.platform).toBe(CredentialPlatform.DEV_TO);
  });
});
