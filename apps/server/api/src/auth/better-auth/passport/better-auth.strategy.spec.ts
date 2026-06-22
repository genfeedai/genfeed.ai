import type { BetterAuthService } from '@api/auth/better-auth/better-auth.service';
import type { BetterAuthIdentityResolverService } from '@api/auth/better-auth/services/better-auth-identity-resolver.service';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BetterAuthStrategy } from './better-auth.strategy';

describe('BetterAuthStrategy', () => {
  let betterAuthService: {
    isEnabled: boolean;
    verifyToken: ReturnType<typeof vi.fn>;
  };
  let identityResolver: { resolve: ReturnType<typeof vi.fn> };
  let strategy: BetterAuthStrategy;

  const requestWith = (authorization?: string): Request =>
    ({ headers: authorization ? { authorization } : {} }) as Request;

  beforeEach(() => {
    betterAuthService = { isEnabled: true, verifyToken: vi.fn() };
    identityResolver = { resolve: vi.fn() };
    strategy = new BetterAuthStrategy(
      betterAuthService as unknown as BetterAuthService,
      identityResolver as unknown as BetterAuthIdentityResolverService,
    );
  });

  it('returns null when Better Auth is disabled', async () => {
    betterAuthService.isEnabled = false;

    const result = await strategy.validate(requestWith('Bearer tok'));

    expect(result).toBeNull();
    expect(betterAuthService.verifyToken).not.toHaveBeenCalled();
  });

  it('throws when no bearer token is present', async () => {
    await expect(strategy.validate(requestWith())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('verifies the token and shapes the resolved identity as publicMetadata', async () => {
    betterAuthService.verifyToken.mockResolvedValue({
      email: 'user@example.com',
      name: 'Ada',
      sub: 'user_1',
    });
    identityResolver.resolve.mockResolvedValue({
      brandId: 'brand_1',
      isSuperAdmin: true,
      organizationId: 'org_1',
      userId: 'user_1',
    });

    const result = await strategy.validate(requestWith('Bearer tok'));

    expect(betterAuthService.verifyToken).toHaveBeenCalledWith('tok');
    expect(identityResolver.resolve).toHaveBeenCalledWith('user_1');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'user_1',
        publicMetadata: {
          brand: 'brand_1',
          isSuperAdmin: true,
          organization: 'org_1',
          user: 'user_1',
        },
      }),
    );
  });

  it('propagates verification failures as Unauthorized', async () => {
    betterAuthService.verifyToken.mockRejectedValue(
      new UnauthorizedException('Invalid token'),
    );

    await expect(
      strategy.validate(requestWith('Bearer bad')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
