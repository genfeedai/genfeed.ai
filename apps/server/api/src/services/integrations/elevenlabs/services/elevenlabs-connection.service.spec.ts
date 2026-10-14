import type { ApiKeyHelperService } from '@api/services/api-key/api-key-helper.service';
import type { ByokService } from '@api/services/byok/byok.service';
import { ElevenLabsConnectionService } from '@api/services/integrations/elevenlabs/services/elevenlabs-connection.service';
import { ByokProvider } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

describe('ElevenLabsConnectionService', () => {
  const organizationId = testId('org');
  let lookupApiKeyWithIdentity: ReturnType<typeof vi.fn>;
  let getApiKey: ReturnType<typeof vi.fn>;
  let service: ElevenLabsConnectionService;

  beforeEach(() => {
    lookupApiKeyWithIdentity = vi.fn().mockResolvedValue({
      apiKey: 'personal-key',
      credentialId: 'credential-v1',
    });
    getApiKey = vi.fn().mockReturnValue('platform-key');
    service = new ElevenLabsConnectionService(
      { lookupApiKeyWithIdentity } as unknown as ByokService,
      { getApiKey } as unknown as ApiKeyHelperService,
    );
  });

  it('binds the personal connection to its credential version', async () => {
    await expect(service.resolve(organizationId, 'byok')).resolves.toEqual({
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

  it('never falls back to the platform key for a personal binding', async () => {
    lookupApiKeyWithIdentity.mockResolvedValue(undefined);

    await expect(
      service.resolve(organizationId, 'byok'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(getApiKey).not.toHaveBeenCalled();
  });

  it('reports a missing platform key', async () => {
    getApiKey.mockReturnValue('');

    await expect(
      service.resolve(organizationId, 'platform'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
