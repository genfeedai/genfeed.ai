import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import {
  TENANT_READ_POLICY,
  type TenantReadPolicyValue,
} from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { runWithTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import type { ITenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.types';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { isEntityId } from '@genfeedai/contracts/api-types';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable } from 'rxjs';

type TenantContextRequest = Request & {
  context?: Pick<
    IRequestContext,
    'isSuperAdmin' | 'organizationId' | 'brandId'
  >;
  user?: AuthenticatedUser;
};

function readRequestOrganizationId(
  request: TenantContextRequest,
): string | undefined {
  const fromContext = request.context?.organizationId?.trim();
  if (fromContext) {
    return fromContext;
  }

  const fromMetadata = request.user?.organizationId?.trim();
  return fromMetadata || undefined;
}

/**
 * A verified superadmin may read another organization through the shared
 * `?organizationId=` override (`CollectionFilterUtil.resolveAuthorizedTenantQuery`).
 * The request then belongs to that tenant, so the Prisma tenant guard must be
 * pinned to it. Every other caller keeps the session organization; naming a
 * different one is rejected by the handler's own authorization. A superadmin
 * with no session organization stays outside enforcement, as before.
 */
function readSuperAdminOrganizationOverride(
  request: TenantContextRequest,
): string | undefined {
  if (!getIsSuperAdmin(request.user, request)) {
    return undefined;
  }

  const override: unknown = request.query?.organizationId;
  return typeof override === 'string' && isEntityId(override.trim())
    ? override.trim()
    : undefined;
}

function readPolicyScope(
  request: TenantContextRequest,
  organizationId: string,
  policy: TenantReadPolicyValue,
): ITenantReadScope | undefined {
  const selected = policy === 'selected';
  const refuse = () => {
    if (selected)
      throw new BadRequestException('Invalid tenant read selection');
    throw new ForbiddenException(
      'Tenant selection is not allowed for this read',
    );
  };
  function readId(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !isEntityId(value.trim())) return refuse();
    return value.trim();
  }
  const requestedOrganization = readId(request.query?.organizationId);
  const requestedBrand = readId(request.query?.brandId);
  const isOrganizationOverride =
    requestedOrganization !== undefined &&
    requestedOrganization !== organizationId;
  if (
    isOrganizationOverride &&
    (!selected || !getIsSuperAdmin(request.user, request))
  ) {
    throw new ForbiddenException(
      'Tenant selection is not allowed for this read',
    );
  }
  if (!selected) return undefined;
  return {
    organizationId: requestedOrganization ?? organizationId,
    brandId:
      requestedBrand ??
      (isOrganizationOverride
        ? undefined
        : (request.context?.brandId ?? request.user?.brandId)),
    isOrganizationOverride,
  };
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector = new Reflector()) {}
  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const request = executionContext
      .switchToHttp()
      .getRequest<TenantContextRequest>();
    const sessionOrganizationId = readRequestOrganizationId(request);
    if (!sessionOrganizationId) {
      return next.handle();
    }
    const policy =
      request.method === 'GET' &&
      typeof executionContext.getHandler === 'function'
        ? this.reflector.get<TenantReadPolicyValue>(
            TENANT_READ_POLICY,
            executionContext.getHandler(),
          )
        : undefined;
    const readScope = policy
      ? readPolicyScope(request, sessionOrganizationId, policy)
      : undefined;
    const organizationId =
      readScope?.organizationId ??
      (policy
        ? sessionOrganizationId
        : (readSuperAdminOrganizationOverride(request) ??
          sessionOrganizationId));
    const inScope = <T>(work: () => T): T =>
      runWithTenantContext({ organizationId }, () =>
        readScope ? runWithTenantReadScope(readScope, work) : work(),
      );

    return new Observable<unknown>((subscriber) =>
      inScope(() => {
        const subscription = next.handle().subscribe({
          complete: () => subscriber.complete(),
          error: (error: unknown) => subscriber.error(error),
          next: (value: unknown) => subscriber.next(value),
        });
        return () => inScope(() => subscription.unsubscribe());
      }),
    );
  }
}
