import { AuthIdentityResolverService } from '@api/auth/services/auth-identity-resolver.service';
import { ConfigService } from '@api/config/config.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { type User, verifyToken } from '@clerk/backend';
import {
  buildClerkHotPathUser,
  hasClerkHotPathClaims,
  resolveClerkSessionClaims,
} from '@helpers/auth/clerk-session-claims.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy } from 'passport-custom';

@Injectable()
export class ClerkStrategy extends PassportStrategy(Strategy, 'clerk') {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly clerkService: ClerkService,
    private readonly loggerService: LoggerService,
    private readonly authIdentityResolverService: AuthIdentityResolverService,
  ) {
    super();
  }

  /**
   * Validates if a token has the correct JWT format (three parts separated by dots)
   * @param token - The token string to validate
   * @returns true if the token has valid JWT format, false otherwise
   */
  private isValidJwtFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    // JWT format: header.payload.signature (three parts separated by dots)
    const parts = token.split('.');
    return parts.length === 3 && parts.every((part) => part.length > 0);
  }

  async validate(req: Request): Promise<User | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const token = req.headers.authorization?.split(' ').pop();

    if (!token) {
      // Don't log errors for missing tokens - they might be accessing public routes
      // The guard will handle authorization based on @Public() decorator
      throw new UnauthorizedException('No token provided');
    }

    // Validate JWT format before attempting verification
    if (!this.isValidJwtFormat(token)) {
      // Don't log errors for invalid format - they might be accessing public routes
      // The guard will handle authorization based on @Public() decorator
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const tokenPayload = await verifyToken(token, {
        secretKey: this.configService.get('CLERK_SECRET_KEY'),
      });

      const sessionClaims = resolveClerkSessionClaims(tokenPayload);
      if (hasClerkHotPathClaims(sessionClaims)) {
        const hotPathUser = buildClerkHotPathUser(sessionClaims);
        if (hotPathUser) {
          return hotPathUser as unknown as User;
        }
      }

      const user = await this.clerkService.getUser(tokenPayload.sub);
      const resolvedIdentity =
        await this.authIdentityResolverService.resolve(user);

      const userWithResolvedMetadata = {
        ...user,
        publicMetadata: {
          ...(user.publicMetadata as Record<string, unknown>),
          clerkId: user.id,
          user: resolvedIdentity.mongoUserId,
        },
      } as unknown as User;

      return userWithResolvedMetadata;
    } catch (error: unknown) {
      // Check if it's a token expiration error for potentially public routes
      // This error will be caught by handleRequest in ClerkGuard for public routes
      const errorObj = error as { reason?: string; message?: string };
      const isTokenExpired =
        errorObj?.reason === 'token-expired' ||
        errorObj?.message?.includes('expired') ||
        errorObj?.message?.includes('JWT is expired');

      // Check if it's an invalid token format error (shouldn't happen now, but handle for safety)
      const isInvalidFormat =
        errorObj?.reason === 'token-invalid' ||
        errorObj?.message?.includes('Invalid JWT form') ||
        errorObj?.message?.includes('A JWT consists of three parts');

      if (isTokenExpired) {
        // Log at debug level instead of error for expired tokens
        // The guard will handle public routes appropriately
        this.loggerService.debug(`${url} token expired`, {
          message: errorObj?.message,
          reason: errorObj?.reason,
        });
        throw new UnauthorizedException('Token expired');
      } else if (isInvalidFormat) {
        // Don't log errors for invalid format - they might be accessing public routes
        // The guard will handle authorization based on @Public() decorator
        throw new UnauthorizedException('Invalid token format');
      }

      const isNetworkError = errorObj?.reason === 'jwk-remote-failed-to-load';
      const isKeyMismatch = errorObj?.reason === 'jwk-kid-mismatch';
      const isRateLimited =
        (error as { status?: number })?.status === 429 ||
        errorObj?.message === 'Too Many Requests';

      if (isNetworkError) {
        this.loggerService.error(`${url} Clerk JWKS endpoint unreachable`, {
          message: errorObj?.message,
          reason: errorObj?.reason,
        });
        throw new UnauthorizedException('Authentication service unavailable');
      }

      if (isKeyMismatch) {
        this.loggerService.error(
          `${url} Clerk signing key mismatch — keys may have rotated`,
          {
            message: errorObj?.message,
            reason: errorObj?.reason,
          },
        );
        throw new UnauthorizedException('Invalid token');
      }

      if (isRateLimited) {
        this.loggerService.warn(`${url} Clerk API rate limited`, {
          message: errorObj?.message,
          name: (error as Error)?.name,
        });
        throw new ServiceUnavailableException(
          'Authentication service unavailable',
        );
      }

      // Catch-all: log structured Clerk error details
      const clerkError = error as {
        reason?: string;
        message?: string;
        action?: string;
      };
      this.loggerService.error(`${url} failed`, {
        action: clerkError?.action,
        message: clerkError?.message,
        name: (error as Error)?.name,
        reason: clerkError?.reason,
      });
      throw new UnauthorizedException('Invalid token');
    }
  }
}
