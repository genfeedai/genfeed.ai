import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import {
  ORGANIZATION_MODULE_KEY,
  type OrganizationModuleEndpointPolicy,
} from '@api/common/organization-modules/organization-module.decorator';
import { runWithOrganizationModule } from '@api/common/organization-modules/organization-module-execution.context';
import {
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/** Propagate trusted route ownership; headers, body and client metadata are ignored. */
@Injectable()
export class OrganizationModuleExecutionInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const policy = this.reflector.getAllAndOverride<
      OrganizationModuleEndpointPolicy | undefined
    >(ORGANIZATION_MODULE_KEY, [context.getHandler(), context.getClass()]);
    if (!policy) return next.handle();
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const organizationId = request.user?.organizationId;
    if (!organizationId || organizationId !== request.context?.organizationId)
      throw new ForbiddenException(
        'Authenticated organization context is required',
      );
    return new Observable((subscriber) =>
      runWithOrganizationModule(
        { moduleId: policy.moduleId, organizationId },
        () => {
          const subscription = next.handle().subscribe(subscriber);
          return () => subscription.unsubscribe();
        },
      ),
    );
  }
}
