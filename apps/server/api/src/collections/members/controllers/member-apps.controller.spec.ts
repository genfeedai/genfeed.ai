import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MemberAppsController } from '@api/collections/members/controllers/member-apps.controller';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { testId } from '@helpers/testing/test-id.helper';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { defer, firstValueFrom } from 'rxjs';

describe('MemberAppsController (#5502)', () => {
  const makeUser = (overrides: Partial<User> = {}) =>
    ({
      id: 'auth-provider-1',
      isSuperAdmin: false,
      organizationId: 'org-1',
      userId: 'user-1',
      ...overrides,
    }) as unknown as User;

  function makeController({ isReleasePreview = false } = {}) {
    const membersService = {
      findInstalledAppIds: vi.fn().mockResolvedValue(['playground']),
      setAppInstalled: vi.fn().mockResolvedValue(['playground', 'turbo']),
    };
    const moduleAccess = {
      isReleasePreviewActive: vi.fn().mockResolvedValue(isReleasePreview),
    };
    return {
      controller: new MemberAppsController(
        membersService as never,
        moduleAccess as never,
      ),
      membersService,
      moduleAccess,
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

    await expect(controller.installApp(makeUser(), 'turbo')).resolves.toEqual({
      installedAppIds: ['playground', 'turbo'],
    });
    expect(membersService.setAppInstalled).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'turbo',
      true,
    );
  });

  it('refuses founder-only apps outside release preview', async () => {
    const { controller, membersService, moduleAccess } = makeController();

    await expect(
      controller.installApp(makeUser(), 'motion'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(moduleAccess.isReleasePreviewActive).toHaveBeenCalledWith('org-1');
    expect(membersService.setAppInstalled).not.toHaveBeenCalled();
  });

  it('installs founder-only apps for an organization on release preview', async () => {
    const { controller, membersService } = makeController({
      isReleasePreview: true,
    });

    await controller.installApp(makeUser(), 'motion');
    expect(membersService.setAppInstalled).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'motion',
      true,
    );
  });

  it('does not let a super admin install around release preview', async () => {
    const { controller, membersService } = makeController();

    await expect(
      controller.installApp(makeUser({ isSuperAdmin: true }), 'editor'),
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
        controller.installApp(makeUser(), appId),
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
      controller.installApp(makeUser({ organizationId: '' }), 'turbo'),
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

  function tenantRequest(method: string) {
    const user = makeUser({
      organizationId: testId('member-app-org'),
      userId: testId('member-app-user'),
      isSuperAdmin: true,
    });
    return {
      method,
      context: { organizationId: user.organizationId, isSuperAdmin: true },
      query: { organizationId: testId('member-app-org', 2) },
      user,
    };
  }

  function executionContext(
    req: ReturnType<typeof tenantRequest>,
    handler: unknown,
  ): ExecutionContext {
    return {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  it('refuses an operator organization override before reading personal apps', () => {
    const { controller, membersService } = makeController();
    const req = tenantRequest('GET');
    const next = {
      handle: vi.fn(() => defer(() => controller.findInstalledApps(req.user))),
    };
    expect(() =>
      new TenantContextInterceptor().intercept(
        executionContext(req, MemberAppsController.prototype.findInstalledApps),
        next,
      ),
    ).toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
    expect(membersService.findInstalledAppIds).not.toHaveBeenCalled();
  });

  it.each(['PUT', 'DELETE'] as const)(
    'keeps a personal %s in the session tenant despite an operator query override',
    async (method) => {
      const { controller, membersService } = makeController();
      const req = tenantRequest(method);
      membersService.setAppInstalled.mockImplementation(
        async (organizationId: string) => {
          assertTenantScopedQuery({
            isCloud: true,
            model: 'Member',
            operation: 'update',
            tenantModelNames: new Set(['Member']),
            args: { where: { organizationId, isDeleted: false } },
          });
          return ['turbo'];
        },
      );
      const handler =
        method === 'PUT'
          ? MemberAppsController.prototype.installApp
          : MemberAppsController.prototype.uninstallApp;
      const next = {
        handle: () =>
          defer(() =>
            method === 'PUT'
              ? controller.installApp(req.user, 'turbo')
              : controller.uninstallApp(req.user, 'turbo'),
          ),
      };
      await expect(
        firstValueFrom(
          new TenantContextInterceptor().intercept(
            executionContext(req, handler),
            next,
          ),
        ),
      ).resolves.toEqual({ installedAppIds: ['turbo'] });
      expect(membersService.setAppInstalled).toHaveBeenCalledWith(
        req.user.organizationId,
        req.user.userId,
        'turbo',
        method === 'PUT',
      );
    },
  );
});
