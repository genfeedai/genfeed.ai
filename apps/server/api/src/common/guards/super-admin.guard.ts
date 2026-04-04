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

    if (!req.context) {
      throw new ForbiddenException('Request context not available');
    }

    if (!req.context.isSuperAdmin) {
      throw new ForbiddenException('Super admin access required');
    }

    return true;
  }
}
