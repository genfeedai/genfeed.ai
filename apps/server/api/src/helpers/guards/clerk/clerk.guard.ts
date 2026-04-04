import { IS_PUBLIC_KEY } from '@libs/decorators/public.decorator';
import {
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ClerkGuard extends AuthGuard('clerk') {
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

  handleRequest(
    err: unknown,
    user: unknown,
    _info: unknown,
    context: ExecutionContext,
  ) {
    if (this.isPublicRoute(context)) {
      return user || null;
    }

    if (err || !user) {
      throw err || new UnauthorizedException('Unauthorized');
    }

    return user;
  }
}
