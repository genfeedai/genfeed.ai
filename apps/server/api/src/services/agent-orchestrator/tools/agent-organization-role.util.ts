import { resolveApiKeyEffectiveMemberRole } from '@api/helpers/utils/auth/api-key-role.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { PopulateBuilder } from '@api/shared/utils/populate/populate.util';
import { MemberRole } from '@genfeedai/contracts';

export type AgentMembersServiceLike = {
  findOne: (
    query: Record<string, unknown>,
    populate?: unknown[],
  ) => Promise<{
    currentBrandId?: unknown;
    role?: { key?: unknown } | null;
  } | null>;
};

const MEMBER_ROLES: ReadonlySet<string> = new Set(Object.values(MemberRole));

function isMemberRole(value: string): value is MemberRole {
  return MEMBER_ROLES.has(value);
}

/**
 * The caller's organization role key from their active membership. Fails
 * closed to `''` so an unresolved membership is never shown as a role.
 */
export async function resolveOrganizationRole(
  membersService: AgentMembersServiceLike,
  ctx: ToolExecutionContext,
): Promise<string> {
  try {
    const member = await membersService.findOne(
      {
        isActive: true,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      },
      [PopulateBuilder.withFields('role', ['id', 'key', 'label'])],
    );
    const key = typeof member?.role?.key === 'string' ? member.role.key : '';
    // An API key never inherits its issuer's org-admin role without an
    // explicit admin scope — the same cap `/auth/whoami` applies.
    return ctx.apiKeyContext && isMemberRole(key)
      ? resolveApiKeyEffectiveMemberRole(ctx.apiKeyContext, key)
      : key;
  } catch {
    return '';
  }
}
