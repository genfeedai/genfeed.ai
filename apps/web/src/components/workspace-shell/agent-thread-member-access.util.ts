import { MemberRole } from '@genfeedai/contracts';
import type { AgentThreadMember } from '@/components/workspace-shell/props/agent-threads-panel.props';

/**
 * Whether a member may open a thread in this brand. The server lets owners and
 * administrators into every brand; any other member needs an explicit
 * assignment. A thread outside a brand is open to everyone.
 */
export function canReachThreadBrand(
  member: Pick<AgentThreadMember, 'brandIds' | 'roleKey'>,
  brandId: string | null | undefined,
): boolean {
  if (!brandId) {
    return true;
  }
  if (
    member.roleKey === MemberRole.OWNER ||
    member.roleKey === MemberRole.ADMIN
  ) {
    return true;
  }
  return member.brandIds.includes(brandId);
}
