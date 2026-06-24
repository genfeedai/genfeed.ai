import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

function buildContext(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  };
}

describe('SuperAdminGuard', () => {
  const guard = new SuperAdminGuard();

  it('req.context.isSuperAdmin = true → passes', () => {
    const ctx = buildContext({
      context: { isSuperAdmin: true } as Partial<IRequestContext>,
    });
    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  it('req.context.isSuperAdmin = false → ForbiddenException', () => {
    const ctx = buildContext({
      context: { isSuperAdmin: false } as Partial<IRequestContext>,
    });
    expect(() => guard.canActivate(ctx as never)).toThrow(ForbiddenException);
  });

  it('authenticated user publicMetadata.isSuperAdmin = true → passes without request context', () => {
    const ctx = buildContext({
      user: {
        publicMetadata: { isSuperAdmin: true },
      },
    });

    expect(guard.canActivate(ctx as never)).toBe(true);
  });

  it('missing superadmin context and user metadata → ForbiddenException', () => {
    const ctx = buildContext({});
    expect(() => guard.canActivate(ctx as never)).toThrow(ForbiddenException);
  });
});
