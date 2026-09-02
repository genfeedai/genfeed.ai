import type { AuthenticatedRequest } from '@api/auth/interfaces/authenticated-user.interface';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';

const LEGACY_OBJECT_ID_PATTERN = /^[0-9a-f]{24}$/i;

export function isUsableOrganizationId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const organizationId = value.trim();
  return (
    isEntityId(organizationId) || LEGACY_OBJECT_ID_PATTERN.test(organizationId)
  );
}

/**
 * Resolve the workspace an authenticated request belongs to.
 *
 * `request.context` is hydrated by `RequestContextMiddleware`, which runs
 * before the global auth guard. Better Auth sessions therefore reach guards
 * with `request.user` set but no context, so the authenticated identity is the
 * authoritative fallback. Both sources go through the same usability check so a
 * URL slug can never masquerade as an organization id.
 */
export function readRequestOrganizationId(
  request: Pick<AuthenticatedRequest, 'context' | 'user'>,
): string | undefined {
  const contextOrganizationId = request.context?.organizationId;
  if (isUsableOrganizationId(contextOrganizationId)) {
    return contextOrganizationId.trim();
  }

  const userOrganizationId = request.user?.organizationId;
  if (isUsableOrganizationId(userOrganizationId)) {
    return userOrganizationId.trim();
  }

  return undefined;
}
