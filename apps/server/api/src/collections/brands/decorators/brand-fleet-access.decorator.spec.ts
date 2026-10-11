import { BrandFleetFlagInterceptor } from '@api/collections/brands/decorators/brand-fleet-access.decorator';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

function run(request: Record<string, unknown>) {
  const handle = vi.fn(() => 'next');
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  new BrandFleetFlagInterceptor().intercept(context, {
    handle,
  } as unknown as CallHandler);
  return handle;
}

describe('BrandFleetFlagInterceptor', () => {
  it('drops isFleetEnabled from the body for a regular member', () => {
    const body = { isFleetEnabled: true, label: 'Brand' };
    const handle = run({ body, user: { isSuperAdmin: false } });

    expect(body).toEqual({ label: 'Brand' });
    expect(handle).toHaveBeenCalledOnce();
  });

  it('keeps isFleetEnabled for a superadmin', () => {
    const body = { isFleetEnabled: true, label: 'Brand' };
    run({ body, user: { isSuperAdmin: true } });

    expect(body).toEqual({ isFleetEnabled: true, label: 'Brand' });
  });

  it('keeps isFleetEnabled when the request context marks a superadmin', () => {
    const body = { isFleetEnabled: false };
    run({ body, context: { isSuperAdmin: true }, user: {} });

    expect(body).toEqual({ isFleetEnabled: false });
  });

  it('leaves requests without a body untouched', () => {
    expect(() => run({ user: {} })).not.toThrow();
  });
});
