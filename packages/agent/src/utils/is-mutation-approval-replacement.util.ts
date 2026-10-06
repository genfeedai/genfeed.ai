import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';

/** A server-issued fresh preview replaces the source without reusing consent. */
export function isMutationApprovalReplacement(
  card: AgentUiAction | null | undefined,
  sourceId: string,
): boolean {
  return Boolean(
    card &&
      card.type === 'mutation_approval_card' &&
      card.data?.replacesSourceActionId === sourceId &&
      card.data.status === 'pending' &&
      typeof card.data.approvalId === 'string' &&
      card.id === card.data.sourceActionId &&
      card.id === `mutation-approval:${card.data.approvalId}` &&
      card.id !== sourceId,
  );
}
