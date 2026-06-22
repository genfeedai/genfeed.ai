import { BETTER_AUTH_STRATEGY_NAME } from '@api/auth/better-auth/better-auth.constants';
import { BetterAuthService } from '@api/auth/better-auth/better-auth.service';
import { BetterAuthIdentityResolverService } from '@api/auth/better-auth/services/better-auth-identity-resolver.service';
import type { User } from '@clerk/backend';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-custom';

/**
 * Passport strategy validating first-party Better Auth JWTs beside ClerkStrategy
 * (epic #735, Phase 1 — #736).
 *
 * Verifies the bearer JWT (in-process; the API is the issuer + JWKS publisher),
 * then resolves the genfeed identity from the existing tables and shapes the
 * result as the same Clerk `User` object the rest of the app expects, so
 * `RequestContextMiddleware` and downstream guards consume it unchanged.
 */
@Injectable()
export class BetterAuthStrategy extends PassportStrategy(
  Strategy,
  BETTER_AUTH_STRATEGY_NAME,
) {
  constructor(
    private readonly betterAuthService: BetterAuthService,
    private readonly identityResolver: BetterAuthIdentityResolverService,
  ) {
    super();
  }

  async validate(req: Request): Promise<User | null> {
    if (!this.betterAuthService.isEnabled) {
      return null;
    }

    const token = req.headers.authorization?.split(' ').pop();
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    const claims = await this.betterAuthService.verifyToken(token);
    const identity = await this.identityResolver.resolve(claims.sub);

    return {
      emailAddresses: claims.email
        ? [{ emailAddress: claims.email, id: claims.sub }]
        : [],
      firstName: claims.name ?? null,
      id: claims.sub,
      lastName: null,
      publicMetadata: {
        brand: identity.brandId,
        isSuperAdmin: identity.isSuperAdmin,
        organization: identity.organizationId,
        user: identity.userId,
      },
    } as unknown as User;
  }
}
