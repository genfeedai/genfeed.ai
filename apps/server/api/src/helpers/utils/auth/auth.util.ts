import type {
  AuthenticatedUser,
  IAuthPublicMetadata,
} from '@api/auth/interfaces/authenticated-user.interface';
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
 * Request context interface containing organization, brand, and user IDs.
 * ObjectId fields are optional - check before using in queries.
 */
export interface RequestContext {
  organizationId: string;
  brandId: string;
  userId: string;
  organizationObjectId?: string;
  brandObjectId?: string;
  userObjectId?: string;
}

/**
 * Query DTO with optional organization, brand, and user overrides
 */
export interface ContextQueryDto {
  organization?: string;
  brand?: string;
  user?: string;
}

/**
 * Extract request context (organizationId, brandId, userId) from user metadata and query params.
 * Query params take precedence over user metadata, allowing for admin override scenarios.
 *
 * @param user - authenticated user object
 * @param query - Optional query DTO with organization, brand, user overrides
 * @returns RequestContext with string IDs and ObjectId conversions
 *
 * @example
 * const ctx = extractRequestContext(user, query);
 * const items = await this.service.find({
 *   organization: ctx.organizationObjectId,
 *   isDeleted: false,
 * });
 */
export function extractRequestContext(
  user: AuthenticatedUser,
  query?: ContextQueryDto,
): RequestContext {
  const publicMetadata = getPublicMetadata(user);

  const organizationId =
    query?.organization || publicMetadata.organization?.toString() || '';
  const brandId = query?.brand || publicMetadata.brand?.toString() || '';
  const userId = query?.user || publicMetadata.user?.toString() || '';

  return {
    brandId,
    brandObjectId: brandId ? brandId : undefined,
    organizationId,
    organizationObjectId: organizationId ? organizationId : undefined,
    userId,
    userObjectId: userId ? userId : undefined,
  };
}

/**
 * Build a base filter for organization-scoped queries.
 * Includes organization and isDeleted by default.
 * Throws if organizationObjectId is missing to prevent unscoped queries.
 *
 * @param ctx - Request context
 * @param options - Optional flags to include user/brand filters
 * @returns filter object
 * @throws Error if organizationObjectId is undefined
 *
 * @example
 * const filter = buildOrgFilter(ctx, { includeBrand: true });
 * // { organization: ObjectId, brand: ObjectId, isDeleted: false }
 */
export function buildOrgFilter(
  ctx: RequestContext,
  options?: { includeUser?: boolean; includeBrand?: boolean },
): Record<string, unknown> {
  if (!ctx.organizationObjectId) {
    throw new Error(
      'Organization ID is required for organization-scoped queries',
    );
  }

  const filter: Record<string, unknown> = {
    isDeleted: false,
    organization: ctx.organizationObjectId,
  };

  if (options?.includeUser && ctx.userObjectId) {
    filter.user = ctx.userObjectId;
  }

  if (options?.includeBrand && ctx.brandObjectId) {
    filter.brand = ctx.brandObjectId;
  }

  return filter;
}
