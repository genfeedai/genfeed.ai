import { buildSerializer } from '@serializers/builders';
import { credentialSerializerConfig } from '@serializers/configs/organizations/credential.config';
import { describe, expect, it } from 'vitest';

describe('credential serializer platform contract', () => {
  const { CredentialSerializer } = buildSerializer(
    'server',
    credentialSerializerConfig,
  );

  it('maps Prisma platform labels to the lowercase API vocabulary', () => {
    const output = CredentialSerializer.serialize({
      id: 'credential-1',
      platform: 'YOUTUBE',
    });

    expect(output.data).toMatchObject({
      attributes: { platform: 'youtube' },
      id: 'credential-1',
      type: 'credential',
    });
  });

  it('fails closed for an unknown Prisma platform label', () => {
    expect(() =>
      CredentialSerializer.serialize({
        id: 'credential-1',
        platform: 'UNKNOWN_NETWORK',
      }),
    ).toThrow('Unknown credential platform: UNKNOWN_NETWORK');
  });

  it.each([
    {
      expected: 'reconnect',
      grantedScopes: ['tweet.read', 'tweet.write', 'users.read'],
      grantedScopesCapturedAt: '2026-10-20T00:00:00.000Z',
    },
    {
      expected: 'ok',
      grantedScopes: ['dm.read', 'tweet.read', 'tweet.write'],
      grantedScopesCapturedAt: '2026-10-20T00:00:00.000Z',
    },
    {
      expected: 'unknown',
      grantedScopes: [],
      grantedScopesCapturedAt: null,
    },
  ])(
    'derives X directMessageCapability $expected without exposing the scope list',
    ({ expected, grantedScopes, grantedScopesCapturedAt }) => {
      const output = CredentialSerializer.serialize({
        grantedScopes,
        grantedScopesCapturedAt,
        id: 'credential-x',
        platform: 'TWITTER',
      });

      expect(output.data).toMatchObject({
        attributes: { directMessageCapability: expected },
      });
      expect(output.data).not.toHaveProperty('attributes.grantedScopes');
    },
  );
});
