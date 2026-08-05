import type {
  AuthenticatedUser,
  IAuthPublicMetadata,
} from '@api/auth/interfaces/authenticated-user.interface';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

const EMPTY_PUBLIC_METADATA: IAuthPublicMetadata = {
  brand: '',
  isSuperAdmin: false,
  organization: '',
  user: '',
};

export function getPublicMetadata(
  user: AuthenticatedUser | null | undefined,
): IAuthPublicMetadata {
  return {
    ...EMPTY_PUBLIC_METADATA,
    ...(user?.publicMetadata ?? {}),
  };
}

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

  const publicMetadata = getPublicMetadata(user);
  return publicMetadata.isSuperAdmin === true;
}

export function getStripeSubscriptionStatus(
  user: AuthenticatedUser | null | undefined,
  request?: ContextCarrier,
): string {
  if (request?.context?.stripeSubscriptionStatus !== undefined) {
    return request.context.stripeSubscriptionStatus;
  }

  const publicMetadata = getPublicMetadata(user);
  return publicMetadata.stripeSubscriptionStatus ?? '';
}

export function getSubscriptionTier(
  user: AuthenticatedUser | null | undefined,
  request?: ContextCarrier,
): string {
  if (request?.context?.subscriptionTier !== undefined) {
    return request.context.subscriptionTier;
  }

  const publicMetadata = getPublicMetadata(user);
  return publicMetadata.subscriptionTier ?? '';
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
 * Extract request context (organizationId, brandId, userId) from user metadata and query params.
 * Query params take precedence over user metadata, allowing for admin override scenarios.
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
  const publicMetadata = getPublicMetadata(user);

  const organizationId =
    query?.organizationId || publicMetadata.organization?.toString() || '';
  const brandId = query?.brandId || publicMetadata.brand?.toString() || '';
  const userId = query?.userId || publicMetadata.user?.toString() || '';

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
  const organizationId =
    canOverrideScope && query.organizationId
      ? query.organizationId
      : requestContext.organizationId;
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
