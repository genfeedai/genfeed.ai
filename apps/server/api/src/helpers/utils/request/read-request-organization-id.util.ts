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

export function readRequestOrganizationId(
  request: Pick<AuthenticatedRequest, 'context'>,
): string | undefined {
  const organizationId = request.context?.organizationId;
  if (isUsableOrganizationId(organizationId)) {
    return organizationId.trim();
  }

  return undefined;
}
