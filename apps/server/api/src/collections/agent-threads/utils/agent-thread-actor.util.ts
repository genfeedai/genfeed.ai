import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import { resolveAgentThreadOrganizationId } from '@api/collections/agent-threads/utils/agent-thread-identity.util';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import type { Request } from 'express';

/** The actor the thread access check and the brand reach resolve against. */
export function buildAgentThreadActor(
  user: User,
  organizationId: string,
  userId: string,
): BrandAccessActor {
  return {
    apiKeyId: user.apiKeyId,
    isApiKey: user.isApiKey,
    organizationId,
    scopes: user.scopes,
    userId,
  };
}

/**
 * Plain GET routes run in the tenant context the interceptor pins: the session
 * organization, or the one a verified superadmin names with `?organizationId=`.
 * Query that same organization so the tenant guard sees one tenant; a caller
 * who is not a superadmin is refused for any other one.
 */
export function resolveAgentThreadReadOrganizationId(
  req: Request,
  user: User,
): string {
  const requested = req.query?.organizationId;
  const authorized = CollectionFilterUtil.resolveAuthorizedTenantQuery(
    { organizationId: typeof requested === 'string' ? requested : undefined },
    user,
    getIsSuperAdmin(user, req),
  );
  return authorized.organizationId ?? resolveAgentThreadOrganizationId(user);
}
