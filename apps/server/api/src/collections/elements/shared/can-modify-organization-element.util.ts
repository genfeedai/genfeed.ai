import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';

export interface OrganizationOwnedElement {
  organizationId?: string | null;
}

/** Authorize writes to organization-owned elements and fail closed for global rows. */
export function canModifyOrganizationElement(
  user: AuthenticatedUser,
  entity: OrganizationOwnedElement,
): boolean {
  if (getIsSuperAdmin(user)) {
    return true;
  }

  const organizationId = entity.organizationId;
  return Boolean(organizationId && organizationId === user.organizationId);
}
