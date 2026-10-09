import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  ORGANIZATION_MODULE_KEY,
  type OrganizationModuleEndpointPolicy,
} from '@api/common/organization-modules/organization-module.decorator';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class OrganizationModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: OrganizationModuleAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<
      OrganizationModuleEndpointPolicy | undefined
    >(ORGANIZATION_MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!policy) return true;
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const organizationId = request.user?.organizationId;
    if (!organizationId || request.context?.organizationId !== organizationId)
      throw new ForbiddenException(
        'Authenticated organization context is required',
      );
    const operation =
      policy.operation ??
      (['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? 'read' : 'write');
    await this.access.assertAccess(organizationId, policy.moduleId, operation);
    return true;
  }
}
