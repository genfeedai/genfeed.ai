import { MemberRole } from '@genfeedai/contracts';
import { ForbiddenException } from '@nestjs/common';

export const OWNER_MEMBERSHIP_CHANGE_FORBIDDEN_MESSAGE =
  "Only an organization owner can grant the owner role or change an owner's membership.";

/**
 * Owners and admins both manage members, but the owner role sits above admin:
 * only an owner (or a platform superadmin) may grant it, or change the role,
 * activation or deletion of a member who holds it. Without this an admin could
 * promote themselves or remove the owner.
 *
 * `actorRole` is the caller's effective role (API-key cap applied);
 * `targetRoleKey` is the role the member holds now (absent for an invitation);
 * `nextRoleKey` is the role being assigned, when one is.
 */
export function assertMembershipChangeAllowed(input: {
  actorRole: MemberRole | null;
  isSuperAdmin: boolean;
  nextRoleKey?: string | null;
  targetRoleKey?: string | null;
}): void {
  if (input.isSuperAdmin) {
    return;
  }
  const isOwnerInvolved =
    input.targetRoleKey === MemberRole.OWNER ||
    input.nextRoleKey === MemberRole.OWNER;
  if (isOwnerInvolved && input.actorRole !== MemberRole.OWNER) {
    throw new ForbiddenException(OWNER_MEMBERSHIP_CHANGE_FORBIDDEN_MESSAGE);
  }
}
