import { HeyGenIdentityService } from '@api/services/integrations/heygen/services/heygen-identity.service';
import { VoiceProvider } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const connection = {
    apiKey: 'current-key',
    binding: {
      provider: 'heygen',
      kind: 'byok',
      organizationId: 'org',
      credentialVersionId: 'current',
    },
  };
  const heygen = {
    resolveAvatarSelection: vi.fn(),
    resolveOrganizationConnection: vi.fn().mockResolvedValue(connection),
    validateVoiceSelection: vi.fn().mockResolvedValue({
      voiceId: 'voice',
      name: 'Current voice',
      preview: '',
      ownership: 'private',
      connection: connection.binding,
    }),
  };
  return { heygen, service: new HeyGenIdentityService(heygen as never) };
}

describe('saved HeyGen voice admission', () => {
  it('revalidates access and retains the selection after key rotation', async () => {
    const { heygen, service } = fixture();
    const result = await service.voiceDefault(
      {
        source: 'catalog',
        provider: VoiceProvider.HEYGEN,
        externalVoiceId: 'voice',
        ownership: 'private',
        connection: {
          provider: 'heygen',
          kind: 'byok',
          organizationId: 'org',
          credentialVersionId: 'previous',
        },
      },
      'org',
    );
    expect(result.externalVoiceId).toBe('voice');
    expect(result.connection?.credentialVersionId).toBe('current');
    expect(heygen.resolveOrganizationConnection).toHaveBeenCalledWith(
      'org',
      'byok',
    );
    expect(heygen.validateVoiceSelection).toHaveBeenCalledWith(
      'voice',
      expect.anything(),
      'private',
    );
  });

  it('rejects a foreign saved voice before looking up a key', async () => {
    const { heygen, service } = fixture();
    await expect(
      service.voiceDefault(
        {
          source: 'catalog',
          provider: VoiceProvider.HEYGEN,
          externalVoiceId: 'voice',
          connection: {
            provider: 'heygen',
            kind: 'byok',
            organizationId: 'foreign',
          },
        },
        'org',
      ),
    ).rejects.toThrow('another organization');
    expect(heygen.resolveOrganizationConnection).not.toHaveBeenCalled();
  });

  it('requires the private partition even if a candidate claims the platform connection', async () => {
    const { heygen, service } = fixture();
    await service.voiceDefault(
      {
        source: 'catalog',
        provider: VoiceProvider.HEYGEN,
        externalVoiceId: 'voice',
        ownership: 'private',
        connection: {
          provider: 'heygen',
          kind: 'platform',
          organizationId: 'org',
        },
      },
      'org',
    );
    expect(heygen.resolveOrganizationConnection).toHaveBeenCalledWith(
      'org',
      'byok',
    );
    expect(heygen.validateVoiceSelection).toHaveBeenCalledWith(
      'voice',
      expect.anything(),
      'private',
    );
  });
});
