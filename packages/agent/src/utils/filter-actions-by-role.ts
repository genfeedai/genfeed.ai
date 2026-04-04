import type { SuggestedAction } from '@cloud/agent/models/agent-suggested-action.model';
import type { MemberRole } from '@genfeedai/enums';

export function filterActionsByRole(
  actions: SuggestedAction[],
  role?: MemberRole,
): SuggestedAction[] {
  return actions.filter((action) => {
    if (!action.visibleTo) {
      return true;
    }
    if (!role) {
      return false;
    }
    return action.visibleTo.includes(role);
  });
}
