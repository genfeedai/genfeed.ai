import { LocalIdentityInterceptor } from '@api/common/interceptors/local-identity.interceptor';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configState = vi.hoisted(() => ({
  betterAuthEnabled: false,
  isSelfHosted: true,
}));

vi.mock('@genfeedai/auth-client/server', () => ({
  isBetterAuthEnabled: () => configState.betterAuthEnabled,
}));

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => configState.isSelfHosted,
  };
});

interface TestRequest {
  headers: Record<string, string>;
  ip?: string;
  user?: Record<string, unknown>;
}

describe('LocalIdentityInterceptor', () => {
  let interceptor: LocalIdentityInterceptor;
  let prisma: {
    brand: { findFirst: ReturnType<typeof vi.fn> };
    organization: { findFirst: ReturnType<typeof vi.fn> };
    user: { findFirst: ReturnType<typeof vi.fn> };
  };
  const next: CallHandler = { handle: () => of(null) };

  function contextFor(req: TestRequest): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    configState.betterAuthEnabled = false;
    configState.isSelfHosted = true;
    prisma = {
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand_1' }) },
      organization: { findFirst: vi.fn().mockResolvedValue({ id: 'org_1' }) },
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'user_1' }) },
    };
    interceptor = new LocalIdentityInterceptor(
      { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['127.0.0.1', '::1', '172.18.0.5'])(
    'injects the local identity for %s when login is off',
    async (ip) => {
      const req: TestRequest = { headers: {}, ip };

      await interceptor.intercept(contextFor(req), next);

      expect(req.user).toEqual(
        expect.objectContaining({ id: 'user_1', organizationId: 'org_1' }),
      );
    },
  );

  it('leaves a remote peer anonymous when login is off', async () => {
    const req: TestRequest = { headers: {}, ip: '198.51.100.9' };

    await interceptor.intercept(contextFor(req), next);

    expect(req.user).toBeUndefined();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('never injects the local identity when login is on', async () => {
    configState.betterAuthEnabled = true;
    const req: TestRequest = { headers: {}, ip: '127.0.0.1' };

    await interceptor.intercept(contextFor(req), next);

    expect(req.user).toBeUndefined();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('keeps an authenticated user untouched', async () => {
    const user = { id: 'user_token' };
    const req: TestRequest = { headers: {}, ip: '127.0.0.1', user };

    await interceptor.intercept(contextFor(req), next);

    expect(req.user).toBe(user);
  });

  it('does nothing outside self-host', async () => {
    configState.isSelfHosted = false;
    const req: TestRequest = { headers: {}, ip: '127.0.0.1' };

    await interceptor.intercept(contextFor(req), next);

    expect(req.user).toBeUndefined();
  });
});
