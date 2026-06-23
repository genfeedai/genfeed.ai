import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MarketplaceInstallController } from '@api/marketplace-integration/marketplace-install.controller';
import type { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MarketplaceInstallController', () => {
  let controller: MarketplaceInstallController;
  let installService: { installToWorkspace: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    installService = { installToWorkspace: vi.fn() };
    controller = new MarketplaceInstallController(
      installService as unknown as MarketplaceInstallService,
    );
  });

  it('installs the listing using the user/org from clerk public metadata', async () => {
    const installResult = {
      resourceId: 'wf-1',
      resourceType: 'workflow',
      title: 'Flow',
    };
    installService.installToWorkspace.mockResolvedValue(installResult);

    const user = {
      publicMetadata: { organization: 'org-1', user: 'user-1' },
    } as unknown as User;

    const response = await controller.install('listing-1', user);

    expect(installService.installToWorkspace).toHaveBeenCalledWith(
      'listing-1',
      'user-1',
      'org-1',
    );
    expect(response).toEqual({ data: installResult });
  });

  it('propagates errors thrown by the install service', async () => {
    installService.installToWorkspace.mockRejectedValue(new Error('boom'));
    const user = {
      publicMetadata: { organization: 'org-1', user: 'user-1' },
    } as unknown as User;

    await expect(controller.install('listing-1', user)).rejects.toThrow('boom');
  });
});
