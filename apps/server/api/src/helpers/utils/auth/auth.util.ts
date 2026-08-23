import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { subscriptionStatusFromStripe } from '@genfeedai/enums';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

type ContextCarrier = Request & {
  context?: {
    isSuperAdmin?: boolean;
    stripeSubscriptionStatus?: string;
    subscriptionTier?: string;
  };
};

export function getIsSuperAdmin(
  user: AuthenticatedUser | null | undefined,
  request?: ContextCarrier,
): boolean {
  if (request?.context?.isSuperAdmin !== undefined) {
    return request.context.isSuperAdmin === true;
  }

  return user?.isSuperAdmin === true;
}

/**
 * Returns domain SCREAMING_SNAKE subscription status (or '' when unset).
 * Normalizes legacy lowercase / Stripe US-spelling values so callers can
 * compare against `SubscriptionStatus` members after the #2504 harmonization.
 */
export function getStripeSubscriptionStatus(
  user: AuthenticatedUser | null | undefined,
  request?: ContextCarrier,
): string {
  const raw =
    request?.context?.stripeSubscriptionStatus !== undefined
      ? request.context.stripeSubscriptionStatus
      : (user?.stripeSubscriptionStatus ?? '');

  if (!raw) {
    return '';
  }

  return subscriptionStatusFromStripe(raw);
}

export function getSubscriptionTier(
  user: AuthenticatedUser | null | undefined,
  request?: ContextCarrier,
): string {
  if (request?.context?.subscriptionTier !== undefined) {
    return request.context.subscriptionTier;
  }

  return user?.subscriptionTier ?? '';
}

/**
 * Request context containing canonical Prisma relation IDs.
 */
export interface RequestContext {
  organizationId: string;
  brandId: string;
  userId: string;
}

/**
 * Query DTO with optional canonical scope-id overrides.
 */
export interface ContextQueryDto {
  organizationId?: string;
  brandId?: string;
  userId?: string;
}

/**
 * Resolve the organizationId to use for a tenant-scoped query.
 *
 * This is the single enforcement point for organization-scope resolution:
 * a query-supplied organizationId only ever widens scope for a platform
 * superadmin. Every other caller resolves to their own session organization
 * regardless of what the query asks for. Callers that need the same
 * resolution for a query-driven filter (list endpoints, request context)
 * should call through here instead of re-implementing the fallback.
 *
 * @param user - authenticated user object
 * @param queryOrganizationId - optional organizationId supplied by the caller
 * @returns the authorized organizationId, or '' when none is resolvable
 */
export function resolveAuthorizedOrganizationId(
  user: AuthenticatedUser,
  queryOrganizationId?: string,
): string {
  const canOverrideScope = getIsSuperAdmin(user);

  if (canOverrideScope && queryOrganizationId) {
    return queryOrganizationId;
  }

  return user.organizationId || '';
}

/**
 * Extract request context (organizationId, brandId, userId) from the
 * authenticated user and query params.
 *
 * organizationId is superadmin-gated via `resolveAuthorizedOrganizationId` —
 * a non-superadmin's query override can never widen the tenant scope.
 * brandId/userId narrowing stays query-first: they only ever narrow the
 * result set within the caller's own organization, they cannot select a
 * different tenant's data on their own.
 *
 * @param user - authenticated user object
 * @param query - Optional query DTO with organization, brand, user overrides
 * @returns RequestContext with canonical string IDs
 *
 * @example
 * const ctx = extractRequestContext(user, query);
 * const items = await this.service.find({
 *   organizationId: ctx.organizationId,
 *   isDeleted: false,
 * });
 */
export function extractRequestContext(
  user: AuthenticatedUser,
  query?: ContextQueryDto,
): RequestContext {
  const organizationId = resolveAuthorizedOrganizationId(
    user,
    query?.organizationId,
  );
  const brandId = query?.brandId || user.brandId || '';
  const userId = query?.userId || user.userId || user.id || '';

  return {
    brandId,
    organizationId,
    userId,
  };
}

export function resolveRequiredBrandRequestContext(
  user: AuthenticatedUser,
  query: Pick<ContextQueryDto, 'brandId' | 'organizationId'> = {},
): Pick<RequestContext, 'brandId' | 'organizationId' | 'userId'> {
  const requestContext = extractRequestContext(user);
  const canOverrideScope = getIsSuperAdmin(user);
  const organizationId = resolveAuthorizedOrganizationId(
    user,
    query.organizationId,
  );
  const brandId =
    canOverrideScope && query.brandId ? query.brandId : requestContext.brandId;
  const userId = requestContext.userId || user.id;

  if (!organizationId || !brandId || !userId) {
    throw new BadRequestException(
      'Organization, brand, and user context are required',
    );
  }

  return { brandId, organizationId, userId };
}

/**
 * Build a base filter for organization-scoped queries.
 * Includes organization and isDeleted by default.
 * Throws if organizationId is missing to prevent unscoped queries.
 *
 * @param ctx - Request context
 * @param options - Optional flags to include user/brand filters
 * @returns filter object
 * @throws Error if organizationId is empty
 *
 * @example
 * const filter = buildOrgFilter(ctx, { includeBrand: true });
 * // { organizationId: '...', brandId: '...', isDeleted: false }
 */
export function buildOrgFilter(
  ctx: RequestContext,
  options?: { includeUser?: boolean; includeBrand?: boolean },
): Record<string, unknown> {
  if (!ctx.organizationId) {
    throw new Error(
      'Organization ID is required for organization-scoped queries',
    );
  }

  const filter: Record<string, unknown> = {
    isDeleted: false,
    organizationId: ctx.organizationId,
  };

  if (options?.includeUser && ctx.userId) {
    filter.userId = ctx.userId;
  }

  if (options?.includeBrand && ctx.brandId) {
    filter.brandId = ctx.brandId;
  }

  return filter;
}
