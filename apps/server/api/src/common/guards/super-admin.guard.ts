import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
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

    if (!getIsSuperAdmin(req.user, req)) {
      throw new ForbiddenException('Super admin access required');
    }

    return true;
  }
}
