import type { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { HeyGenIdentityService } from '@api/services/integrations/heygen/services/heygen-identity.service';
import { VoiceProvider } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

type Binding = {
  credentialVersionId?: string;
  kind: string;
  organizationId: string;
  provider: string;
};

/**
 * HeyGen with one connection per (organization, partition): the org's current
 * BYOK key and the platform key. Voice lookups are recorded with the
 * partition they ran against.
 */
function fixture() {
  const connections: Record<string, { apiKey: string; binding: Binding }> = {
    'org:byok': {
      apiKey: 'current-key',
      binding: {
        credentialVersionId: 'current',
        kind: 'byok',
        organizationId: 'org',
        provider: 'heygen',
      },
    },
    'org:platform': {
      apiKey: 'platform-key',
      binding: { kind: 'platform', organizationId: 'org', provider: 'heygen' },
    },
  };
  const lookups: { apiKey: string; ownership: unknown; voiceId: string }[] = [];
  const heygen = {
    resolveOrganizationConnection: async (
      organizationId: string,
      kind: string,
    ) => {
      const connection = connections[`${organizationId}:${kind}`];
      if (!connection) throw new Error(`No ${kind} HeyGen connection`);
      return connection;
    },
    validateVoiceSelection: async (
      voiceId: string,
      connection: { apiKey: string; binding: Binding },
      ownership: unknown,
    ) => {
      lookups.push({ apiKey: connection.apiKey, ownership, voiceId });
      return {
        connection: connection.binding,
        name: 'Current voice',
        ownership: 'private',
        preview: '',
        voiceId,
      };
    },
  };
  return {
    lookups,
    service: new HeyGenIdentityService(heygen as unknown as HeyGenService),
  };
}

describe('saved HeyGen voice admission', () => {
  it('revalidates access and retains the selection after key rotation', async () => {
    const { lookups, service } = fixture();

    const result = await service.voiceDefault(
      {
        connection: {
          credentialVersionId: 'previous',
          kind: 'byok',
          organizationId: 'org',
          provider: 'heygen',
        },
        externalVoiceId: 'voice',
        ownership: 'private',
        provider: VoiceProvider.HEYGEN,
        source: 'catalog',
      },
      'org',
    );

    expect(result).toMatchObject({
      connection: { credentialVersionId: 'current', kind: 'byok' },
      externalVoiceId: 'voice',
      label: 'Current voice',
    });
    expect(lookups).toEqual([
      { apiKey: 'current-key', ownership: 'private', voiceId: 'voice' },
    ]);
  });

  it('rejects a foreign saved voice before looking up a key', async () => {
    const { lookups, service } = fixture();

    await expect(
      service.voiceDefault(
        {
          connection: {
            kind: 'byok',
            organizationId: 'foreign',
            provider: 'heygen',
          },
          externalVoiceId: 'voice',
          provider: VoiceProvider.HEYGEN,
          source: 'catalog',
        },
        'org',
      ),
    ).rejects.toThrow('another organization');
    expect(lookups).toEqual([]);
  });

  it('requires the private partition even if a candidate claims the platform connection', async () => {
    const { lookups, service } = fixture();

    const result = await service.voiceDefault(
      {
        connection: {
          kind: 'platform',
          organizationId: 'org',
          provider: 'heygen',
        },
        externalVoiceId: 'voice',
        ownership: 'private',
        provider: VoiceProvider.HEYGEN,
        source: 'catalog',
      },
      'org',
    );

    expect(result.connection).toMatchObject({ kind: 'byok' });
    expect(lookups).toEqual([
      { apiKey: 'current-key', ownership: 'private', voiceId: 'voice' },
    ]);
  });
});
