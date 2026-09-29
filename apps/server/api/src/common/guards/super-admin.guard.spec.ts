import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
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

  it('missing superadmin context and user metadata → ForbiddenException', () => {
    const ctx = buildContext({});
    expect(() => guard.canActivate(ctx as never)).toThrow(ForbiddenException);
  });
});
