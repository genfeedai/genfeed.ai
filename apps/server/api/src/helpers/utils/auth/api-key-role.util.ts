import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { hasExplicitApiKeyAdminScope, MemberRole } from '@genfeedai/enums';

/**
 * API keys authenticate as the issuing user for tenancy, but they must not
 * inherit that user's org-admin membership. Without an explicit `admin` scope
 * the effective role is capped at `user` even when the issuer is owner/admin.
 * Session tokens are unchanged.
 */
export function resolveApiKeyEffectiveMemberRole(
  user: Pick<AuthenticatedUser, 'isApiKey' | 'scopes'>,
  membershipRole: MemberRole,
): MemberRole {
  if (user.isApiKey !== true) {
    return membershipRole;
  }

  const isOrgAdmin =
    membershipRole === MemberRole.ADMIN || membershipRole === MemberRole.OWNER;
  if (isOrgAdmin && !hasExplicitApiKeyAdminScope(user.scopes)) {
    return MemberRole.USER;
  }

  return membershipRole;
}
