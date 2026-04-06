import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ClerkGuard } from '@api/helpers/guards/clerk/clerk.guard';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/**
 * Combined authentication guard that supports both Clerk JWT and API keys.
 * Used as the global APP_GUARD.
 *
 * Order of checks:
 *  1. @Public() routes → allow immediately
 *  2. Self-hosted edition → allow immediately (skip all auth)
 *  3. Bearer token starting with `gf_` → delegate to ApiKeyAuthGuard
 *  4. Everything else → delegate to ClerkGuard (Clerk JWT)
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private clerkGuard: ClerkGuard,
    private apiKeyAuthGuard: ApiKeyAuthGuard,
  ) {}

  /**
   * Check whether the current route is decorated with @Public()
   */
  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  /**
   * Convert guard result to boolean
   */
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

    // 2. Self-hosted edition bypasses all auth
    if (IS_SELF_HOSTED) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];

    // 3. API key authentication (token starts with gf_)
    if (token?.startsWith('gf_')) {
      return this.apiKeyAuthGuard.canActivate(context);
    }

    // 4. Clerk JWT authentication (or no auth header - let Clerk handle the error)
    const result = await this.clerkGuard.canActivate(context);
    return this.resolveGuardResult(result);
  }
}
