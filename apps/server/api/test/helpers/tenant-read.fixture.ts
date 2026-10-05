import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { getTenantContext } from '@libs/prisma/tenant-context';

export const sessionOrganizationId = '550e8400-e29b-41d4-a716-446655440001';
export const targetOrganizationId = '550e8400-e29b-41d4-a716-446655440002';
export const sessionBrandId = '550e8400-e29b-41d4-a716-446655440003';
export const targetBrandId = '550e8400-e29b-41d4-a716-446655440004';
export const memberUser: AuthenticatedUser = {
  brandId: sessionBrandId,
  id: 'opaque-user-id',
  isSuperAdmin: false,
  organizationId: sessionOrganizationId,
  userId: 'opaque-user-id',
};
export const adminUser: AuthenticatedUser = {
  ...memberUser,
  isSuperAdmin: true,
};

export function tenantReadQuery<T extends BaseQueryDto>(
  QueryDto: new () => T,
  overrides: Partial<T> = {},
): T & Record<string, unknown> {
  const queryFields: Record<string, unknown> = {};
  return Object.assign(new QueryDto(), queryFields, overrides);
}

export function tenantReadRequest(
  user = memberUser,
  query: Record<string, unknown> = {},
): RequestWithContext {
  return {
    context: {
      hydratedAt: Date.now(),
      isSuperAdmin: user.isSuperAdmin ?? false,
      organizationId: user.organizationId ?? '',
      stripeSubscriptionStatus: 'active',
      subscriptionTier: 'free',
      userId: user.userId ?? user.id,
    },
    headers: {},
    originalUrl: '/v1/collection',
    params: {},
    query,
    user,
  } as RequestWithContext;
}

export function fieldValues(value: unknown, field: string): unknown[] {
  if (Array.isArray(value))
    return value.flatMap((item) => fieldValues(item, field));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(key === field && item !== undefined ? [item] : []),
    ...fieldValues(item, field),
  ]);
}

export function emptyPage() {
  return { docs: [], limit: 20, page: 1, totalDocs: 0, totalPages: 1 };
}

/** Matches Prisma's lazy thenable: context is observed when awaited. */
export function lazyTenantResult<T>(
  value: T,
  onExecute: (context: ReturnType<typeof getTenantContext>) => void,
) {
  return {
    // biome-ignore lint/suspicious/noThenProperty: Deliberately model a lazy Prisma promise to verify tenant context at await time.
    then(resolve: (result: T) => unknown) {
      onExecute(getTenantContext());
      return resolve(value);
    },
  };
}
