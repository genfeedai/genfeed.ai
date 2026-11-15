import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MarketplaceInstallController } from '@api/marketplace-integration/marketplace-install.controller';
import type { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function requestWith(authorization: string | undefined): Request {
  return { headers: { authorization } } as unknown as Request;
}

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

  it('installs the listing using the user/org from authProvider public metadata', async () => {
    const installResult = {
      resourceId: 'wf-1',
      resourceType: 'workflow',
      title: 'Flow',
    };
    installService.installToWorkspace.mockResolvedValue(installResult);

    const user = {
      organizationId: 'org-1',
      userId: 'user-1',
    } as unknown as User;

    const response = await controller.install(
      'listing-1',
      user,
      requestWith('Bearer buyer-token'),
    );

    expect(installService.installToWorkspace).toHaveBeenCalledWith(
      'listing-1',
      'user-1',
      'org-1',
      'buyer-token',
    );
    expect(response).toEqual({ data: installResult });
  });

  it('propagates errors thrown by the install service', async () => {
    installService.installToWorkspace.mockRejectedValue(new Error('boom'));
    const user = {
      organizationId: 'org-1',
      userId: 'user-1',
    } as unknown as User;

    await expect(
      controller.install('listing-1', user, requestWith('Bearer t')),
    ).rejects.toThrow('boom');
  });

  it('passes no token on when the request has no bearer header', async () => {
    installService.installToWorkspace.mockResolvedValue({});
    const user = {
      organizationId: 'org-1',
      userId: 'user-1',
    } as unknown as User;

    await controller.install('listing-1', user, requestWith(undefined));

    expect(installService.installToWorkspace).toHaveBeenCalledWith(
      'listing-1',
      'user-1',
      'org-1',
      undefined,
    );
  });
});
