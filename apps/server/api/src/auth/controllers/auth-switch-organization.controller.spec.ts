import { AuthSwitchOrganizationController } from '@api/auth/controllers/auth-switch-organization.controller';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('AuthSwitchOrganizationController', () => {
  const apiKey = { id: 'key-1' };
  const user = {
    apiKeyId: 'key-1',
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as AuthenticatedUser;
  let apiKeysService: {
    findActiveById: ReturnType<typeof vi.fn>;
    switchActiveOrganization: ReturnType<typeof vi.fn>;
  };
  let controller: AuthSwitchOrganizationController;

  beforeEach(() => {
    apiKeysService = {
      findActiveById: vi.fn().mockResolvedValue(apiKey),
      switchActiveOrganization: vi.fn().mockResolvedValue(true),
    };
    controller = new AuthSwitchOrganizationController(
      apiKeysService as unknown as ApiKeysService,
    );
  });

  it('switches the calling session to the requested organization', async () => {
    await expect(
      controller.switchOrganization(user, { organizationId: 'org-2' }),
    ).resolves.toEqual({ data: { organizationId: 'org-2' } });
    expect(apiKeysService.findActiveById).toHaveBeenCalledWith('key-1');
    expect(apiKeysService.switchActiveOrganization).toHaveBeenCalledWith(
      apiKey,
      'org-2',
    );
  });

  it('rejects a caller that is not an API key session', async () => {
    await expect(
      controller.switchOrganization(
        { ...user, apiKeyId: undefined },
        { organizationId: 'org-2' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(apiKeysService.switchActiveOrganization).not.toHaveBeenCalled();
  });

  it('rejects a session whose key is no longer active', async () => {
    apiKeysService.findActiveById.mockResolvedValue(null);

    await expect(
      controller.switchOrganization(user, { organizationId: 'org-2' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 403 when the session may not move to that organization', async () => {
    apiKeysService.switchActiveOrganization.mockResolvedValue(false);

    await expect(
      controller.switchOrganization(user, { organizationId: 'org-9' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
