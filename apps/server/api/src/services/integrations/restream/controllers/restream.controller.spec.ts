import { RestreamController } from '@api/services/integrations/restream/controllers/restream.controller';
import { CredentialPlatform } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    connectAccount: vi.fn(),
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
    credentialsService.connectAccount.mockResolvedValue({
      id: 'cred-pending',
      isConnected: true,
    });

    await controller.verify(
      { headers: {} } as never,
      {
        id: 'user-1',
        organizationId: 'org-1',
        userId: 'user-1',
      } as never,
      'oauth-code',
      'oauth-state',
    );

    expect(credentialsService.findPendingOAuthCredential).toHaveBeenCalledWith(
      'oauth-state',
      CredentialPlatform.RESTREAM,
      expect.objectContaining({ organizationId: 'org-1' }),
    );
    expect(credentialsService.connectAccount).toHaveBeenCalledWith(
      'cred-pending',
      'org-1',
      expect.objectContaining({ id: 'rs-user-1' }),
      expect.objectContaining({
        accessToken: 'plain-access',
        refreshToken: 'plain-refresh',
      }),
    );
  });

  it('fails closed when organization id is missing on verify', async () => {
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
