import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  ORGANIZATION_MODULE_KEY,
  type OrganizationModuleEndpointPolicy,
  type OrganizationModuleRecoveryPolicy,
} from '@api/common/organization-modules/organization-module.decorator';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { getDeserializer, type JsonApiDocument } from '@genfeedai/helpers';
import { isRecord } from '@genfeedai/utils/data/extract.util';
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
    const admittedOperation =
      operation === 'write' &&
      request.method === 'PATCH' &&
      this.isRecoveryBody(request.body, policy.recovery)
        ? 'cancel'
        : operation;
    await this.access.assertAccess(
      organizationId,
      policy.moduleId,
      admittedOperation,
    );
    return true;
  }

  /** Only an explicitly declared, status-only recovery may bypass new-work admission. */
  private isRecoveryBody(
    body: unknown,
    recovery: OrganizationModuleRecoveryPolicy | undefined,
  ): boolean {
    if (!recovery || !isRecord(body)) return false;
    const isJsonApi = isRecord(body.data) && isRecord(body.data.attributes);
    let normalized: unknown = body;
    if (isJsonApi) {
      try {
        // Match the global validation pipe after checking the JSON:API object shape.
        normalized = getDeserializer(body as JsonApiDocument);
      } catch {
        return false;
      }
    }
    if (!isRecord(normalized)) return false;
    const value = normalized[recovery.field];
    return (
      typeof value === 'string' &&
      recovery.values.includes(value) &&
      Object.keys(normalized).every(
        (key) => key === recovery.field || (isJsonApi && key === 'id'),
      )
    );
  }
}
