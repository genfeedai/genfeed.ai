import { BETTER_AUTH_STRATEGY_NAME } from '@api/auth/better-auth/better-auth.constants';
import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard wrapping the Better Auth Passport strategy (epic #735, #736). Mirrors
 * ClerkGuard so CombinedAuthGuard can delegate to it symmetrically. Public
 * routes bypass; otherwise the bearer JWT is validated by the strategy.
 */
@Injectable()
export class BetterAuthGuard extends AuthGuard(BETTER_AUTH_STRATEGY_NAME) {
  constructor(private reflector: Reflector) {
    super();
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector?.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  canActivate(context: ExecutionContext) {
    if (this.isPublicRoute(context)) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    _info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (this.isPublicRoute(context)) {
      return (user ?? null) as TUser;
    }

    if (err || !user) {
      throw err || new UnauthorizedException('Unauthorized');
    }

    return user as TUser;
  }
}
