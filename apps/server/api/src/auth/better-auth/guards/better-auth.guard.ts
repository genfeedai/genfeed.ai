import { BETTER_AUTH_STRATEGY_NAME } from '@api/auth/better-auth/better-auth.constants';
import { isPublicRoute } from '@libs/decorators/public.decorator';
import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard wrapping the Better Auth Passport strategy (epic #735). Public routes
 * bypass; otherwise the bearer JWT is validated by the strategy.
 */
@Injectable()
export class BetterAuthGuard extends AuthGuard(BETTER_AUTH_STRATEGY_NAME) {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (isPublicRoute(this.reflector, context)) {
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
    if (isPublicRoute(this.reflector, context)) {
      return (user ?? null) as TUser;
    }

    if (err || !user) {
      throw err || new UnauthorizedException('Unauthorized');
    }

    return user as TUser;
  }
}
