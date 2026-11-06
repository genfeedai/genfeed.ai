import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { MemberAppsController } from '@api/collections/members/controllers/member-apps.controller';
import type { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
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

  /**
   * Memberships keyed `org/user`, each with its installed app ids. Every write
   * runs through the CLOUD tenant guard against the organization it names.
   */
  function makeController({ isReleasePreview = false } = {}) {
    const memberships = new Map<string, string[]>([
      ['org-1/user-1', ['playground']],
    ]);
    const reads: string[] = [];
    const membersService = {
      findInstalledAppIds: async (organizationId: string, userId: string) => {
        reads.push(`${organizationId}/${userId}`);
        return memberships.get(`${organizationId}/${userId}`) ?? null;
      },
      setAppInstalled: async (
        organizationId: string,
        userId: string,
        appId: string,
        isInstalled: boolean,
      ) => {
        assertTenantScopedQuery({
          args: { where: { isDeleted: false, organizationId } },
          isCloud: true,
          model: 'Member',
          operation: 'update',
          tenantModelNames: new Set(['Member']),
        });
        const key = `${organizationId}/${userId}`;
        const current = memberships.get(key);
        if (!current) return null;
        const next = current.filter((id) => id !== appId);
        if (isInstalled) next.push(appId);
        memberships.set(key, next);
        return next;
      },
    };
    // Turbo is released in Admin → Flags; Motion and Editor are not.
    const moduleAccess = {
      isReleased: async (_organizationId: string, itemId: string) =>
        isReleasePreview || itemId === 'turbo',
    };
    return {
      controller: new MemberAppsController(
        membersService as unknown as MembersService,
        moduleAccess as unknown as OrganizationModuleAccessService,
      ),
      memberships,
      reads,
    };
  }

  it('returns the caller membership installations in the session organization', async () => {
    const { controller } = makeController();

    await expect(controller.findInstalledApps(makeUser())).resolves.toEqual({
      installedAppIds: ['playground'],
    });
  });

  it('installs a released app for the caller only', async () => {
    const { controller, memberships } = makeController();
    memberships.set('org-1/user-2', []);

    await expect(controller.installApp(makeUser(), 'turbo')).resolves.toEqual({
      installedAppIds: ['playground', 'turbo'],
    });
    expect(memberships.get('org-1/user-2')).toEqual([]);
  });

  it('refuses unreleased apps', async () => {
    const { controller, memberships } = makeController();

    await expect(
      controller.installApp(makeUser(), 'motion'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberships.get('org-1/user-1')).toEqual(['playground']);
  });

  it('installs unreleased apps for an organization on release preview', async () => {
    const { controller } = makeController({ isReleasePreview: true });

    await expect(controller.installApp(makeUser(), 'motion')).resolves.toEqual({
      installedAppIds: ['playground', 'motion'],
    });
  });

  it('does not let a super admin install an unreleased app', async () => {
    const { controller, memberships } = makeController();

    await expect(
      controller.installApp(makeUser({ isSuperAdmin: true }), 'editor'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberships.get('org-1/user-1')).toEqual(['playground']);
  });

  it('lets anyone uninstall a known app, including unreleased ones', async () => {
    const { controller, memberships } = makeController();
    memberships.set('org-1/user-1', ['playground', 'messages']);

    await expect(
      controller.uninstallApp(makeUser(), 'messages'),
    ).resolves.toEqual({ installedAppIds: ['playground'] });
  });

  it.each(['workspace', 'studio', '__proto__'])(
    'rejects the core or unknown app id %s',
    async (appId) => {
      const { controller, memberships } = makeController();

      await expect(
        controller.installApp(makeUser(), appId),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        controller.uninstallApp(makeUser(), appId),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(memberships.get('org-1/user-1')).toEqual(['playground']);
    },
  );

  it('requires an active organization', async () => {
    const { controller, memberships, reads } = makeController();

    await expect(
      controller.findInstalledApps(makeUser({ organizationId: '' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.installApp(makeUser({ organizationId: '' }), 'turbo'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(reads).toEqual([]);
    expect(memberships.get('org-1/user-1')).toEqual(['playground']);
  });

  it('reports a missing membership as not found', async () => {
    const { controller } = makeController();
    const outsider = makeUser({ userId: 'user-without-membership' });

    await expect(controller.findInstalledApps(outsider)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      controller.uninstallApp(outsider, 'turbo'),
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
    const { controller, reads } = makeController();
    const req = tenantRequest('GET');
    let isHandled = false;
    const next = {
      handle: () => {
        isHandled = true;
        return defer(() => controller.findInstalledApps(req.user));
      },
    };

    expect(() =>
      new TenantContextInterceptor().intercept(
        executionContext(req, MemberAppsController.prototype.findInstalledApps),
        next,
      ),
    ).toThrow(ForbiddenException);
    expect(isHandled).toBe(false);
    expect(reads).toEqual([]);
  });

  it.each([
    ['PUT', ['turbo']],
    ['DELETE', []],
  ] as const)(
    'keeps a personal %s in the session tenant despite an operator query override',
    async (method, expectedApps) => {
      const { controller, memberships } = makeController();
      const req = tenantRequest(method);
      const sessionKey = `${req.user.organizationId}/${req.user.userId}`;
      const overrideKey = `${req.query.organizationId}/${req.user.userId}`;
      memberships.set(sessionKey, method === 'PUT' ? [] : ['turbo']);
      memberships.set(overrideKey, method === 'PUT' ? [] : ['turbo']);
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
      ).resolves.toEqual({ installedAppIds: expectedApps });
      expect(memberships.get(sessionKey)).toEqual(expectedApps);
      expect(memberships.get(overrideKey)).toEqual(
        method === 'PUT' ? [] : ['turbo'],
      );
    },
  );
});
