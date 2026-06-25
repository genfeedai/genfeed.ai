import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithContext>();

    if (req.context?.isSuperAdmin !== true) {
      throw new ForbiddenException('Super admin access required');
    }

    return true;
  }
}
