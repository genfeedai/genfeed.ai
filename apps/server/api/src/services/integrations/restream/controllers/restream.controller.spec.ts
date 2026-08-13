import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { RestreamController } from '@api/services/integrations/restream/controllers/restream.controller';
import { CredentialPlatform } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: 'org-1',
    user: 'user-1',
  }),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data })),
}));

/**
 * OAuth verify must pass plaintext tokens into CredentialsService.patch so
 * encryptSecretFields runs (encrypt-on-write boundary). Never write raw
 * tokens via prisma.credential.update.
 */
describe('RestreamController OAuth encrypt path', () => {
  const restreamService = {
    exchangeCodeForToken: vi.fn(),
    generateAuthUrl: vi.fn(),
    getProfile: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
  };
  const credentialsService = {
    beginOAuthForBrand: vi.fn(),
    findPendingOAuthCredential: vi.fn(),
    patch: vi.fn(),
  };
  const brandsService = {
    findOne: vi.fn(),
  };

  let controller: RestreamController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new RestreamController(
      restreamService as never,
      credentialsService as never,
      brandsService as never,
    );
  });

  it('stores exchanged tokens via CredentialsService.patch (encrypt-on-write)', async () => {
    credentialsService.findPendingOAuthCredential.mockResolvedValue({
      id: 'cred-pending',
    });
    restreamService.exchangeCodeForToken.mockResolvedValue({
      access_token: 'plain-access',
      expires_in: 3600,
      refresh_token: 'plain-refresh',
    });
    restreamService.getProfile.mockResolvedValue({
      id: 'rs-user-1',
      username: 'streamer',
    });
    credentialsService.patch.mockResolvedValue({
      id: 'cred-pending',
      isConnected: true,
    });

    await controller.verify(
      { headers: {} } as never,
      {
        id: 'user-1',
        publicMetadata: { organization: 'org-1', user: 'user-1' },
      } as never,
      'oauth-code',
      'oauth-state',
    );

    expect(credentialsService.findPendingOAuthCredential).toHaveBeenCalledWith(
      'oauth-state',
      CredentialPlatform.RESTREAM,
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(credentialsService.patch).toHaveBeenCalledWith(
      'cred-pending',
      expect.objectContaining({
        accessToken: 'plain-access',
        isConnected: true,
        refreshToken: 'plain-refresh',
      }),
    );
  });

  it('fails closed when organization id is missing on verify', async () => {
    vi.mocked(getPublicMetadata).mockReturnValueOnce({
      organization: '',
      user: 'user-1',
    } as never);

    await expect(
      controller.verify(
        { headers: {} } as never,
        { id: 'user-1' } as never,
        'oauth-code',
        'oauth-state',
      ),
    ).rejects.toThrow(
      "Restream OAuth is missing a resolvable 'organization' id",
    );
    expect(
      credentialsService.findPendingOAuthCredential,
    ).not.toHaveBeenCalled();
  });
});
