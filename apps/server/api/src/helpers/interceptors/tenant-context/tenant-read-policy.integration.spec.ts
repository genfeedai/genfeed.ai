import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { resolveTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { testId } from '@helpers/testing/test-id.helper';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
import type { ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, Observable, of } from 'rxjs';

const originalOrg = testId('org');
const selectedOrg = testId('org', 2);
const original: AuthenticatedUser = {
  id: testId('user'),
  userId: testId('user'),
  organizationId: originalOrg,
  brandId: testId('brand'),
  isSuperAdmin: true,
};
class PolicyController {
  @TenantReadPolicy('selected')
  @LogMethod({ logStart: false, logEnd: false, logError: false })
  selected() {
    return resolveTenantReadScope(original).organizationId;
  }
  unmarked() {}
  @TenantReadPolicy('owner')
  owner() {}
  @TenantReadPolicy('mutating')
  mutating() {}
}
function context(
  request: Record<string, unknown>,
  handler: () => void,
): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
describe('tenant read policy real scope integration', () => {
  it('selected data scope agrees with real Prisma enforcement and preserves principal identity', async () => {
    const user = { ...original };
    const requestContext = {
      organizationId: originalOrg,
      isSuperAdmin: true,
      brandId: original.brandId,
    };
    const request = {
      method: 'GET',
      context: requestContext,
      user,
      query: { organizationId: selectedOrg },
    };
    const delegate = vi.fn((organizationId: string) => [
      { organizationId, id: 'selected-row' },
    ]);
    const next = {
      handle: () =>
        defer(() => {
          const scope = resolveTenantReadScope(user);
          assertTenantScopedQuery({
            isCloud: true,
            model: 'Brand',
            operation: 'findMany',
            tenantModelNames: new Set(['Brand']),
            args: {
              where: { organizationId: scope.organizationId, isDeleted: false },
            },
          });
          expect(getTenantContext()).toEqual({ organizationId: selectedOrg });
          expect(scope.brandId).toBeUndefined();
          return of(delegate(scope.organizationId));
        }),
    };
    await expect(
      firstValueFrom(
        new TenantContextInterceptor().intercept(
          context(request, PolicyController.prototype.selected),
          next,
        ),
      ),
    ).resolves.toEqual([{ organizationId: selectedOrg, id: 'selected-row' }]);
    expect(request.user).toBe(user);
    expect(request.context).toBe(requestContext);
    expect(user).toEqual(original);
  });
  it.each(['owner', 'mutating'] as const)(
    'foreign %s read is rejected before handler or delegate',
    (policy) => {
      const next = { handle: vi.fn(() => of(null)) };
      const request = {
        method: 'GET',
        user: original,
        query: { organizationId: selectedOrg },
      };
      expect(() =>
        new TenantContextInterceptor().intercept(
          context(request, PolicyController.prototype[policy]),
          next,
        ),
      ).toThrow();
      expect(next.handle).not.toHaveBeenCalled();
    },
  );
});

describe('tenant read policy boundaries and subscription lifecycle', () => {
  const interceptor = new TenantContextInterceptor();
  const request = (
    query: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
  ) => ({ method: 'GET', user: { ...original }, query, ...extra });
  async function scopeFor(
    r: Record<string, unknown>,
    handler = PolicyController.prototype.selected,
  ) {
    return firstValueFrom(
      interceptor.intercept(context(r, handler), {
        handle: () => defer(() => of(resolveTenantReadScope(original))),
      }),
    );
  }
  it.each([undefined, originalOrg])(
    'preserves original brand for absent/equal organization %s',
    async (organizationId) => {
      expect(
        await scopeFor(request(organizationId ? { organizationId } : {})),
      ).toEqual({
        organizationId: originalOrg,
        brandId: original.brandId,
        isOrganizationOverride: false,
      });
    },
  );
  it('retains explicit selected brand while clearing old brand on org change', async () => {
    const brandId = testId('brand', 2);
    expect(
      await scopeFor(request({ organizationId: selectedOrg, brandId })),
    ).toEqual({
      organizationId: selectedOrg,
      brandId,
      isOrganizationOverride: true,
    });
    expect(
      (await scopeFor(request({ organizationId: selectedOrg }))).brandId,
    ).toBeUndefined();
  });
  it.each(['', ' ', 'malformed', [selectedOrg], { id: selectedOrg }])(
    'rejects malformed selected organization/brand %j with400 before service',
    (value) => {
      for (const key of ['organizationId', 'brandId']) {
        const next = { handle: vi.fn(() => of(null)) };
        expect(() =>
          interceptor.intercept(
            context(
              request({ [key]: value }),
              PolicyController.prototype.selected,
            ),
            next,
          ),
        ).toThrow(expect.objectContaining({ status: 400 }));
        expect(next.handle).not.toHaveBeenCalled();
      }
    },
  );
  it.each(['owner', 'mutating'] as const)(
    'permits absent/equal %s selections and rejects malformed ones with403',
    async (policy) => {
      for (const query of [{}, { organizationId: originalOrg }]) {
        const next = { handle: vi.fn(() => of('original-handler')) };
        expect(
          await firstValueFrom(
            interceptor.intercept(
              context(request(query), PolicyController.prototype[policy]),
              next,
            ),
          ),
        ).toBe('original-handler');
        expect(next.handle).toHaveBeenCalledOnce();
      }
      expect(() =>
        interceptor.intercept(
          context(
            request({ organizationId: [] }),
            PolicyController.prototype[policy],
          ),
          { handle: () => of(null) },
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
    },
  );
  it.each([false, true])(
    'rejects foreign member/IP-bound-false selection while preserving principal superadmin=%s',
    (isSuperAdmin) => {
      const next = { handle: vi.fn(() => of(null)) };
      const r = request(
        { organizationId: selectedOrg },
        {
          user: { ...original, isSuperAdmin },
          context: { organizationId: originalOrg, isSuperAdmin: false },
        },
      );
      expect(() =>
        interceptor.intercept(
          context(r, PolicyController.prototype.selected),
          next,
        ),
      ).toThrow(expect.objectContaining({ status: 403 }));
      expect(next.handle).not.toHaveBeenCalled();
    },
  );
  it('does not manufacture a selected tenant without authenticated organization', async () => {
    const r = request(
      { organizationId: selectedOrg },
      { user: { ...original, organizationId: '' } },
    );
    const next = { handle: () => defer(() => of(getTenantContext())) };
    expect(
      await firstValueFrom(
        interceptor.intercept(
          context(r, PolicyController.prototype.selected),
          next,
        ),
      ),
    ).toBeUndefined();
  });
  it('preserves unmarked and non-GET legacy behavior without creating read scope', async () => {
    for (const [method, handler] of [
      ['GET', PolicyController.prototype.unmarked],
      ['POST', PolicyController.prototype.selected],
    ] as const) {
      expect(
        await scopeFor(
          request({ organizationId: selectedOrg }, { method }),
          handler,
        ),
      ).toEqual({
        organizationId: originalOrg,
        brandId: original.brandId,
        isOrganizationOverride: false,
      });
    }
  });
  it('isolates two lazy asynchronous subscriptions using both real scope stores', async () => {
    const results = await Promise.all(
      [2, 3].map((n) =>
        firstValueFrom(
          interceptor.intercept(
            context(
              request({ organizationId: testId('org', n) }),
              PolicyController.prototype.selected,
            ),
            {
              handle: () =>
                defer(async () => {
                  await new Promise((resolve) => setImmediate(resolve));
                  expect(getTenantContext()?.organizationId).toBe(
                    testId('org', n),
                  );
                  return resolveTenantReadScope(original).organizationId;
                }),
            },
          ),
        ),
      ),
    );
    expect(results).toEqual([testId('org', 2), testId('org', 3)]);
  });
  it('propagates errors and runs unsubscribe cleanup inside the selected scope', async () => {
    const r = request({ organizationId: selectedOrg });
    const cleanup = vi.fn(() =>
      expect(resolveTenantReadScope(original).organizationId).toBe(selectedOrg),
    );
    const stream = interceptor.intercept(
      context(r, PolicyController.prototype.selected),
      {
        handle: () =>
          new Observable((subscriber) => {
            setImmediate(() => subscriber.error(new Error('expected')));
            return cleanup;
          }),
      },
    );
    await expect(firstValueFrom(stream)).rejects.toThrow('expected');
    expect(cleanup).toHaveBeenCalledOnce();
    const subscription = interceptor
      .intercept(context(r, PolicyController.prototype.selected), {
        handle: () => new Observable(() => cleanup),
      })
      .subscribe();
    subscription.unsubscribe();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
  it('reads policy metadata from an inherited LogMethod-wrapped handler', async () => {
    class Inherited extends PolicyController {}
    expect(
      (
        await scopeFor(
          request({ organizationId: selectedOrg }),
          Inherited.prototype.selected,
        )
      ).organizationId,
    ).toBe(selectedOrg);
  });
});

it('dispatches an explicit inherited forwarding method under the same immutable selected scope', async () => {
  class Forwarded extends PolicyController {
    @TenantReadPolicy('selected')
    override selected() {
      return super.selected();
    }
  }
  const controller = new Forwarded();
  const request = {
    method: 'GET',
    user: original,
    query: { organizationId: selectedOrg },
  };
  const value = await firstValueFrom(
    new TenantContextInterceptor().intercept(
      context(request, Forwarded.prototype.selected),
      { handle: () => defer(() => of(controller.selected())) },
    ),
  );
  expect(value).toBe(selectedOrg);
});
