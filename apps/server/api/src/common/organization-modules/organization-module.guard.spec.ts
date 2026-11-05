import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

@OrganizationModule('turbo')
class TurboController {
  write() {}
  list() {}
  @OrganizationModule('turbo', 'export')
  export() {}
  @OrganizationModule('turbo', 'write')
  mutatingGet() {}
}
class OpenController {
  settings() {}
}
function createContext(
  controller: new () => object,
  method: string,
  request: Record<string, unknown>,
) {
  return {
    getClass: () => controller,
    getHandler: () => (controller.prototype as Record<string, unknown>)[method],
    switchToHttp: () => ({ getRequest: () => request }),
  };
}
const identity = {
  user: { organizationId: 'org-1' },
  context: { organizationId: 'org-1' },
};

describe('OrganizationModuleGuard', () => {
  it('leaves auth/settings/billing routes without module metadata alone', async () => {
    const assertAccess = vi.fn();
    const guard = new OrganizationModuleGuard(new Reflector(), {
      assertAccess,
    } as never);
    await expect(
      guard.canActivate(createContext(OpenController, 'settings', {}) as never),
    ).resolves.toBe(true);
    expect(assertAccess).not.toHaveBeenCalled();
  });
  it.each([
    { isApiKey: true },
    { isSuperAdmin: true },
    { isApiKey: true, isSuperAdmin: true },
  ])('has no key/admin/credits bypass: %j', async (flags) => {
    const assertAccess = vi.fn().mockRejectedValue(new Error('disabled'));
    const guard = new OrganizationModuleGuard(new Reflector(), {
      assertAccess,
    } as never);
    await expect(
      guard.canActivate(
        createContext(TurboController, 'write', {
          ...identity,
          user: { ...identity.user, ...flags },
          method: 'POST',
          creditsConfig: { amount: 1 },
          body: { moduleId: 'playground', organizationId: 'forged' },
        }) as never,
      ),
    ).rejects.toThrow('disabled');
    expect(assertAccess).toHaveBeenCalledWith(
      'org-1',
      'turbo',
      'write',
      expect.any(Object),
    );
  });
  it.each([
    {},
    { user: { organizationId: 'org-1' } },
    { user: { organizationId: 'org-1' }, context: { organizationId: 'org-2' } },
  ])(
    'rejects unresolved or conflicting authenticated scope',
    async (request) => {
      const assertAccess = vi.fn();
      const guard = new OrganizationModuleGuard(new Reflector(), {
        assertAccess,
      } as never);
      await expect(
        guard.canActivate(
          createContext(TurboController, 'write', {
            ...request,
            method: 'POST',
            headers: { 'x-genfeed-organization-id': 'org-1' },
          }) as never,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(assertAccess).not.toHaveBeenCalled();
    },
  );
  const operationCases = [
    ['list', 'GET', 'read'],
    ['export', 'POST', 'export'],
    ['mutatingGet', 'GET', 'write'],
  ];

  // An access policy for org-1's turbo module that answers `operation` with
  // `isGranted` and every other operation the opposite way.
  function policyFor(operation: string, isGranted: boolean) {
    return async (organizationId: string, moduleId: string, op: string) => {
      const isMatch =
        organizationId === 'org-1' && moduleId === 'turbo' && op === operation;
      if (isMatch !== isGranted) {
        throw new Error('disabled');
      }
    };
  }

  function canActivate(
    handler: string,
    method: string,
    assertAccess: ReturnType<typeof policyFor>,
  ) {
    const guard = new OrganizationModuleGuard(new Reflector(), {
      assertAccess,
    } as never);
    return guard.canActivate(
      createContext(TurboController, handler, {
        ...identity,
        method,
      }) as never,
    );
  }

  it.each(operationCases)(
    'allows %s over %s when the %s operation is granted',
    async (handler, method, operation) => {
      await expect(
        canActivate(handler, method, policyFor(operation, true)),
      ).resolves.toBe(true);
    },
  );

  it.each(operationCases)(
    'denies %s over %s when the %s operation is withheld',
    async (handler, method, operation) => {
      await expect(
        canActivate(handler, method, policyFor(operation, false)),
      ).rejects.toThrow('disabled');
    },
  );
});
