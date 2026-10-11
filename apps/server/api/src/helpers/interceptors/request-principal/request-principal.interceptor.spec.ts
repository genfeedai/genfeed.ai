import { getRequestPrincipal } from '@api/authorization/brand-access/request-principal.context';
import { RequestPrincipalInterceptor } from '@api/helpers/interceptors/request-principal/request-principal.interceptor';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, of } from 'rxjs';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RequestPrincipalInterceptor', () => {
  const interceptor = new RequestPrincipalInterceptor();

  async function principalSeenByHandler(request: Record<string, unknown>) {
    let seen: ReturnType<typeof getRequestPrincipal>;
    const next = {
      handle: () =>
        defer(() => {
          seen = getRequestPrincipal();
          return of(null);
        }),
    } as CallHandler;
    await firstValueFrom(interceptor.intercept(makeContext(request), next));
    return seen;
  }

  it('binds the authenticated member for the handler and nothing outside it', async () => {
    expect(
      await principalSeenByHandler({
        user: {
          id: 'user-1',
          userId: 'user-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
        },
      }),
    ).toEqual({
      apiKeyId: undefined,
      isApiKey: false,
      organizationId: 'org-1',
      scopes: [],
      userId: 'user-1',
    });
    expect(getRequestPrincipal()).toBeUndefined();
  });

  it('binds an API key with its key id and scopes', async () => {
    expect(
      await principalSeenByHandler({
        user: {
          id: 'user-1',
          userId: 'user-1',
          organizationId: 'org-1',
          brandId: 'brand-1',
          isApiKey: true,
          apiKeyId: 'key-1',
          scopes: ['posts:schedule'],
        },
      }),
    ).toEqual({
      apiKeyId: 'key-1',
      isApiKey: true,
      organizationId: 'org-1',
      scopes: ['posts:schedule'],
      userId: 'user-1',
    });
  });

  it.each([
    [{}],
    [{ user: { id: 'user-1', userId: 'user-1' } }],
    [{ user: { organizationId: 'org-1' } }],
  ])(
    'binds no principal for an unauthenticated request (%j)',
    async (request) => {
      expect(await principalSeenByHandler(request)).toBeUndefined();
    },
  );

  it('never carries one request principal into the next', async () => {
    await principalSeenByHandler({
      user: { id: 'user-1', userId: 'user-1', organizationId: 'org-1' },
    });
    expect(await principalSeenByHandler({})).toBeUndefined();
  });
});
