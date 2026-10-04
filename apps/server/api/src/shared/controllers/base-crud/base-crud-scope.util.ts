import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import type { Request } from 'express';

/** Resolve a canonical scalar FK or populated Prisma relation to its id. */
export function resolveScopeId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value || null;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = (value as { id?: unknown }).id;

  return typeof candidate === 'string' && candidate ? candidate : null;
}

/**
 * `BaseService` scopes every id lookup and single-row write to the request
 * tenant, so a foreign organization's row, or a platform row
 * (`organizationId: null`) on a write, is unreachable through it. A superadmin
 * may read, edit and remove any row (the controller checks already let them
 * past `canUserModifyEntity` / `canUserReadEntity`), so only their calls opt
 * out of tenant scoping, explicitly. Everyone else runs unchanged.
 */
export function runAsSuperAdmin<R>(
  user: User,
  request: Request,
  work: () => R,
): R {
  return getIsSuperAdmin(user, request) ? crossOrgUnsafe(work) : work();
}
