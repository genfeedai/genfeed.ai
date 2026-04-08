import { REQUIRES_CLOUD_AUTH_KEY } from '@api/helpers/decorators/requires-cloud-auth.decorator';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { IS_HYBRID_MODE, IS_LOCAL_MODE } from '@genfeedai/config';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/**
 * Combined authentication guard that supports both Clerk JWT and API keys.
 * Used as the global APP_GUARD.
 *
 * Order of checks:
 *  1. @Public() routes → allow immediately
 *  2. LOCAL mode → allow (no auth, LocalIdentityInterceptor provides req.user)
 *  3. HYBRID mode → opportunistic auth:
 *     - Has token? → validate (Clerk or API key)
 *     - No token? → allow (LocalIdentityInterceptor provides req.user)
 *     - @RequiresCloudAuth() routes → require valid token
 *  4. CLOUD mode → require auth (Clerk or API key)
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private clerkGuard: ClerkGuard,
    private apiKeyAuthGuard: ApiKeyAuthGuard,
  ) {}

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private requiresCloudAuth(context: ExecutionContext): boolean {
    return (
      this.reflector?.getAllAndOverride<boolean>(REQUIRES_CLOUD_AUTH_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private async resolveGuardResult(
    result: boolean | Observable<boolean>,
  ): Promise<boolean> {
    if (result instanceof Observable) {
      return (await result.toPromise()) ?? false;
    }

    return result;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Public routes bypass all auth
    if (this.isPublicRoute(context)) {
      return true;
    }

    // 2. LOCAL mode: skip all auth (LocalIdentityInterceptor injects req.user)
    if (IS_LOCAL_MODE) {
      if (this.requiresCloudAuth(context)) {
        throw new UnauthorizedException(
          'This endpoint requires a cloud connection',
        );
      }
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];

    // 3. HYBRID mode: opportunistic auth
    if (IS_HYBRID_MODE) {
      // @RequiresCloudAuth() routes must have a valid token
      if (this.requiresCloudAuth(context) && !token) {
        throw new UnauthorizedException(
          'This endpoint requires a cloud connection',
        );
      }

      // No token? Allow through — LocalIdentityInterceptor will inject local user
      if (!token) {
        return true;
      }

      // Has token — validate it
      if (token.startsWith('gf_')) {
        return this.apiKeyAuthGuard.canActivate(context);
      }

      const result = await this.clerkGuard.canActivate(context);
      return this.resolveGuardResult(result);
    }

    // 4. CLOUD mode: require auth
    if (token?.startsWith('gf_')) {
      return this.apiKeyAuthGuard.canActivate(context);
    }

    const result = await this.clerkGuard.canActivate(context);
    return this.resolveGuardResult(result);
  }
}
