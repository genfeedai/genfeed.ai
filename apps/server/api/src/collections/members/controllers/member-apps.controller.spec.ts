import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MemberAppsController } from '@api/collections/members/controllers/member-apps.controller';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

describe('MemberAppsController (#5502)', () => {
  const makeUser = (overrides: Partial<User> = {}) =>
    ({
      id: 'auth-provider-1',
      isSuperAdmin: false,
      organizationId: 'org-1',
      userId: 'user-1',
      ...overrides,
    }) as unknown as User;
  const request = {} as Request;

  function makeController() {
    const membersService = {
      findInstalledAppIds: vi.fn().mockResolvedValue(['playground']),
      setAppInstalled: vi.fn().mockResolvedValue(['playground', 'turbo']),
    };
    return {
      controller: new MemberAppsController(membersService as never),
      membersService,
    };
  }

  it('returns the caller membership installations in the session organization', async () => {
    const { controller, membersService } = makeController();

    await expect(controller.findInstalledApps(makeUser())).resolves.toEqual({
      installedAppIds: ['playground'],
    });
    expect(membersService.findInstalledAppIds).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
  });

  it('installs a released app for the caller only', async () => {
    const { controller, membersService } = makeController();

    await expect(
      controller.installApp(request, makeUser(), 'turbo'),
    ).resolves.toEqual({ installedAppIds: ['playground', 'turbo'] });
    expect(membersService.setAppInstalled).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'turbo',
      true,
    );
  });

  it('refuses founder-only apps to customers', async () => {
    const { controller, membersService } = makeController();

    await expect(
      controller.installApp(request, makeUser(), 'motion'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membersService.setAppInstalled).not.toHaveBeenCalled();
  });

  it('lets the founder operator install founder-only apps', async () => {
    const { controller, membersService } = makeController();

    await controller.installApp(
      request,
      makeUser({ isSuperAdmin: true }),
      'motion',
    );
    expect(membersService.setAppInstalled).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'motion',
      true,
    );
  });

  it('honors a request context that revokes operator access', async () => {
    const { controller, membersService } = makeController();

    await expect(
      controller.installApp(
        { context: { isSuperAdmin: false } } as unknown as Request,
        makeUser({ isSuperAdmin: true }),
        'editor',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(membersService.setAppInstalled).not.toHaveBeenCalled();
  });

  it('lets anyone uninstall a known app, including founder-only ones', async () => {
    const { controller, membersService } = makeController();

    await controller.uninstallApp(makeUser(), 'messages');
    expect(membersService.setAppInstalled).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'messages',
      false,
    );
  });

  it('rejects core and unknown app ids', async () => {
    const { controller, membersService } = makeController();

    for (const appId of ['workspace', 'studio', '__proto__']) {
      await expect(
        controller.installApp(request, makeUser(), appId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        controller.uninstallApp(makeUser(), appId),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(membersService.setAppInstalled).not.toHaveBeenCalled();
  });

  it('requires an active organization', async () => {
    const { controller, membersService } = makeController();

    await expect(
      controller.findInstalledApps(makeUser({ organizationId: '' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.installApp(request, makeUser({ organizationId: '' }), 'turbo'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(membersService.findInstalledAppIds).not.toHaveBeenCalled();
    expect(membersService.setAppInstalled).not.toHaveBeenCalled();
  });

  it('reports a missing membership as not found', async () => {
    const { controller, membersService } = makeController();
    membersService.findInstalledAppIds.mockResolvedValue(null);
    membersService.setAppInstalled.mockResolvedValue(null);

    await expect(
      controller.findInstalledApps(makeUser()),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.uninstallApp(makeUser(), 'turbo'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
