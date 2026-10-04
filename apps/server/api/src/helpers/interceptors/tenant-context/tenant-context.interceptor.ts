import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { IRequestContext } from '@api/common/interfaces/request-context.interface';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

type TenantContextRequest = Request & {
  context?: Pick<IRequestContext, 'isSuperAdmin' | 'organizationId'>;
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
  return typeof override === 'string' && override.trim()
    ? override.trim()
    : undefined;
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
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
    const organizationId =
      readSuperAdminOrganizationOverride(request) ?? sessionOrganizationId;

    return new Observable<unknown>((subscriber) =>
      runWithTenantContext({ organizationId }, () => {
        const subscription = next.handle().subscribe({
          complete: () => subscriber.complete(),
          error: (error: unknown) => subscriber.error(error),
          next: (value: unknown) => subscriber.next(value),
        });
        return () => subscription.unsubscribe();
      }),
    );
  }
}
