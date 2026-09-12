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

/**
 * Identifiable analytics stay inside the caller's own organization.
 *
 * Post titles, provider external ids, per-post metric rows, account handles,
 * and any read that refreshes from a provider with a stored credential are
 * Google user data under the Limited Use policy, which lets staff read it only
 * with the user's agreement, for security, for legal compliance, or when it is
 * aggregated and anonymized. Superadmins keep cross-organization aggregates
 * through `resolveAnalyticsTenantScope`; this resolver gives them no tenant
 * they are not themselves part of.
 */
export function resolveOwnedAnalyticsTenantScope(
  user: AuthenticatedUser,
  request?: Pick<AnalyticsCacheRequest, 'query'>,
): string {
  const requestedOrganizationId = readRequestedOrganizationId(request);

  if (!user.organizationId) {
    throw new ForbiddenException(ANALYTICS_MISSING_ORGANIZATION_MESSAGE);
  }

  if (
    requestedOrganizationId &&
    requestedOrganizationId !== user.organizationId
  ) {
    throwAnalyticsTenantForbidden();
  }

  return user.organizationId;
}

/**
 * Cache key for a route resolved by `resolveOwnedAnalyticsTenantScope`.
 *
 * `buildAnalyticsCacheKey` keys superadmins by the organization they asked for,
 * which collapses to `superadmin:all` when they ask for none — one key two
 * superadmins in different organizations would share. Owned routes always key
 * by the caller's own organization instead.
 */
export function buildOwnedAnalyticsCacheKey(
  route: string,
  request: AnalyticsCacheRequest,
  parts: ReadonlyArray<unknown> = [],
): string {
  return [
    'analytics',
    route,
    'owned',
    request.user?.organizationId ?? 'anonymous',
    ...parts.map((part) => (part == null ? '' : String(part))),
  ].join(':');
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
