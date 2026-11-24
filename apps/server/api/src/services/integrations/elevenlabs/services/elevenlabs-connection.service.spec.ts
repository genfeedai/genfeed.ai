import type { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { ByokProvider } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { BadRequestException } from '@nestjs/common';

describe('ElevenLabsConnectionService', () => {
  const organizationId = testId('org');
  let lookupApiKeyWithIdentity: ReturnType<typeof vi.fn>;
  let service: ElevenLabsConnectionService;

  beforeEach(() => {
    lookupApiKeyWithIdentity = vi.fn().mockResolvedValue({
      apiKey: 'personal-key',
      credentialId: 'credential-v1',
    });
    service = new ElevenLabsConnectionService({
      lookupApiKeyWithIdentity,
    } as unknown as ByokService);
  });

  it('binds the personal connection to its credential version', async () => {
    await expect(service.resolve(organizationId)).resolves.toEqual({
      apiKey: 'personal-key',
      binding: {
        credentialVersionId: 'credential-v1',
        kind: 'byok',
        organizationId,
        provider: 'elevenlabs',
      },
    });
    expect(lookupApiKeyWithIdentity).toHaveBeenCalledWith(
      organizationId,
      ByokProvider.ELEVENLABS,
    );
  });

  it('asks the organization to connect its own account when none is saved', async () => {
    lookupApiKeyWithIdentity.mockResolvedValue(undefined);

    const rejection = await service
      .resolve(organizationId)
      .catch((error: unknown) => error);

    expect(rejection).toBeInstanceOf(BadRequestException);
    expect((rejection as BadRequestException).message).toContain(
      'Connect your ElevenLabs account',
    );
  });
});
