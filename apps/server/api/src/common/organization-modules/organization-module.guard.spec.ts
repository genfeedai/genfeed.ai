import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { OrganizationModuleGuard } from '@api/common/organization-modules/organization-module.guard';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

@OrganizationModule('batch')
class BatchController {
  write() {}
  list() {}
  @OrganizationModule('batch', 'export')
  export() {}
  @OrganizationModule('batch', 'write')
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
        createContext(BatchController, 'write', {
          ...identity,
          user: { ...identity.user, ...flags },
          method: 'POST',
          creditsConfig: { amount: 1 },
          body: { moduleId: 'playground', organizationId: 'forged' },
        }) as never,
      ),
    ).rejects.toThrow('disabled');
    expect(assertAccess).toHaveBeenCalledWith('org-1', 'batch', 'write');
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
          createContext(BatchController, 'write', {
            ...request,
            method: 'POST',
            headers: { 'x-genfeed-organization-id': 'org-1' },
          }) as never,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(assertAccess).not.toHaveBeenCalled();
    },
  );
  it('resolves read, POST export and explicit mutating GET operations from trusted metadata', async () => {
    const assertAccess = vi.fn().mockResolvedValue(undefined);
    const guard = new OrganizationModuleGuard(new Reflector(), {
      assertAccess,
    } as never);
    for (const [handler, method, operation] of [
      ['list', 'GET', 'read'],
      ['export', 'POST', 'export'],
      ['mutatingGet', 'GET', 'write'],
    ]) {
      await guard.canActivate(
        createContext(BatchController, handler, {
          ...identity,
          method,
        }) as never,
      );
      expect(assertAccess).toHaveBeenLastCalledWith(
        'org-1',
        'batch',
        operation,
      );
    }
  });
});
