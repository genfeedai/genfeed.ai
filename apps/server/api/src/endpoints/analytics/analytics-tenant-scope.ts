import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { ForbiddenException } from '@nestjs/common';

export const ANALYTICS_MISSING_ORGANIZATION_MESSAGE =
  'You must be part of an organization to access analytics';

export const ANALYTICS_TENANT_FORBIDDEN = {
  detail: 'Access denied',
  title: 'Forbidden',
} as const;

export type AnalyticsPrivilege = 'customer' | 'superadmin';

export type AnalyticsTenantScope =
  | {
      readonly organizationId: string;
      readonly privilege: 'customer';
    }
  | {
      readonly organizationId: string | undefined;
      readonly privilege: 'superadmin';
    };

export interface AnalyticsCacheRequest {
  readonly context?: {
    readonly isSuperAdmin?: boolean;
  };
  readonly query?: Record<string, unknown>;
  readonly user?: {
    readonly isSuperAdmin?: boolean;
    readonly organizationId?: string;
  };
}

export function throwAnalyticsTenantForbidden(): never {
  throw new ForbiddenException(ANALYTICS_TENANT_FORBIDDEN);
}

/**
 * Superadmins read every organization unless the request names one
 * (`?organizationId=`), which narrows them to that tenant. Customers are always
 * bound to their session organization; naming any other one is forbidden.
 */
export function resolveAnalyticsTenantScope(
  user: AuthenticatedUser,
  request?: Parameters<typeof getIsSuperAdmin>[1],
): AnalyticsTenantScope {
  const requestedOrganizationId = readRequestedOrganizationId(request);

  if (getIsSuperAdmin(user, request)) {
    return {
      organizationId: requestedOrganizationId,
      privilege: 'superadmin',
    };
  }

  if (!user.organizationId) {
    throw new ForbiddenException(ANALYTICS_MISSING_ORGANIZATION_MESSAGE);
  }

  if (
    requestedOrganizationId &&
    requestedOrganizationId !== user.organizationId
  ) {
    throwAnalyticsTenantForbidden();
  }

  return {
    organizationId: user.organizationId,
    privilege: 'customer',
  };
}

export function buildAnalyticsCacheKey(
  route: string,
  request: AnalyticsCacheRequest,
  parts: ReadonlyArray<unknown> = [],
): string {
  const privilege = readAnalyticsPrivilege(request);
  const organizationKey =
    privilege === 'superadmin'
      ? (readRequestedOrganizationId(request) ?? 'all')
      : (request.user?.organizationId ?? 'anonymous');

  return [
    'analytics',
    route,
    privilege,
    organizationKey,
    ...parts.map((part) => (part == null ? '' : String(part))),
  ].join(':');
}

export async function assertAnalyticsBrandInScope(
  findBrand: (where: {
    id: string;
    isDeleted: false;
    organizationId?: string;
  }) => Promise<{ id: string } | null>,
  brandId: string | undefined,
  organizationId: string | undefined,
): Promise<void> {
  if (!brandId) {
    return;
  }

  const brand = await findBrand({
    id: brandId,
    isDeleted: false,
    ...(organizationId ? { organizationId } : {}),
  });

  if (!brand) {
    throwAnalyticsTenantForbidden();
  }
}

function readAnalyticsPrivilege(
  request: AnalyticsCacheRequest,
): AnalyticsPrivilege {
  if (request.context?.isSuperAdmin !== undefined) {
    return request.context.isSuperAdmin ? 'superadmin' : 'customer';
  }

  return request.user?.isSuperAdmin === true ? 'superadmin' : 'customer';
}

function readRequestedOrganizationId(
  request: Pick<AnalyticsCacheRequest, 'query'> | undefined,
): string | undefined {
  const organizationId = request?.query?.organizationId;
  return typeof organizationId === 'string' && organizationId.length > 0
    ? organizationId
    : undefined;
}
