import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { getOrganizationModuleExecutionContext } from '@api/common/organization-modules/organization-module-execution.context';
import { OrganizationModuleExecutionInterceptor } from '@api/common/organization-modules/organization-module-execution.interceptor';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

@OrganizationModule('batch')
class FeatureController {
  execute() {}
  @OrganizationModule('storyboard')
  storyboard() {}
}
class OpenController {
  settings() {}
}

function context(
  controller: typeof FeatureController | typeof OpenController,
  method: string,
  request: object,
): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => Reflect.get(controller.prototype, method),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
const actor = {
  user: { organizationId: 'org-1' },
  context: { organizationId: 'org-1' },
};

describe('OrganizationModuleExecutionInterceptor', () => {
  const interceptor = new OrganizationModuleExecutionInterceptor(
    new Reflector(),
  );
  it.each([
    ['execute', 'batch'],
    ['storyboard', 'storyboard'],
  ])(
    'propagates trusted %s ownership through the lazy async handler, ignoring caller selectors',
    async (method, moduleId) => {
      const next = {
        handle: () =>
          defer(async () => {
            await Promise.resolve();
            return getOrganizationModuleExecutionContext();
          }),
      };
      expect(
        await firstValueFrom(
          interceptor.intercept(
            context(FeatureController, method, {
              ...actor,
              body: { moduleId: 'playground', organizationId: 'forged' },
              headers: { 'x-genfeed-module-id': 'playground' },
            }),
            next,
          ),
        ),
      ).toEqual({ moduleId, organizationId: 'org-1' });
      expect(getOrganizationModuleExecutionContext()).toBeUndefined();
    },
  );
  it('leaves unowned auth/settings/billing handlers alone', async () => {
    expect(
      await firstValueFrom(
        interceptor.intercept(context(OpenController, 'settings', {}), {
          handle: () => of(getOrganizationModuleExecutionContext()),
        }),
      ),
    ).toBeUndefined();
  });
  it.each([
    {},
    { user: actor.user },
    { user: actor.user, context: { organizationId: 'org-2' } },
  ])('rejects missing or conflicting authenticated scope: %j', (request) => {
    const handle = vi.fn();
    expect(() =>
      interceptor.intercept(context(FeatureController, 'execute', request), {
        handle,
      }),
    ).toThrow('Authenticated organization context is required');
    expect(handle).not.toHaveBeenCalled();
  });
});
