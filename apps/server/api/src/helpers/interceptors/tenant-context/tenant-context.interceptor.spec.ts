import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { getTenantContext } from '@libs/prisma/tenant-context';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { defer, firstValueFrom, of } from 'rxjs';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantContextInterceptor', () => {
  const interceptor = new TenantContextInterceptor();

  async function readContext(request: Record<string, unknown>) {
    const next = {
      handle: () => of(null),
    } as CallHandler;
    let captured: ReturnType<typeof getTenantContext> | undefined;
    next.handle = () =>
      defer(() => {
        captured = getTenantContext();
        return of(null);
      });
    await firstValueFrom(interceptor.intercept(makeContext(request), next));
    return captured;
  }

  it('stores organizationId from request.context for Prisma tenant guards', async () => {
    await expect(
      readContext({
        context: { organizationId: 'org-1' },
      }),
    ).resolves.toEqual({ organizationId: 'org-1' });
  });

  it('falls back to authenticated user public metadata', async () => {
    await expect(
      readContext({
        user: {
          organizationId: 'org-meta',
        },
      }),
    ).resolves.toEqual({ organizationId: 'org-meta' });
  });

  it('leaves tenant context empty when the request has no organization', async () => {
    await expect(readContext({ headers: {} })).resolves.toBeUndefined();
  });
});
