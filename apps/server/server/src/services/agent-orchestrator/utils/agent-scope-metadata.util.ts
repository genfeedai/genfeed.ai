import {
  toAgentScopeMetadata,
  type ValidatedAgentScope,
} from '@genfeedai/interfaces';
import type {
  AgentChatContext,
  AgentChatResult,
} from '@server/services/agent-orchestrator/interfaces/agent-chat.interface';

export function withAgentScopeResult(
  result: AgentChatResult,
  scope: ValidatedAgentScope,
): AgentChatResult {
  return {
    ...result,
    brandId: scope.brandId,
    contextVersion: scope.contextVersion,
  };
}

export function buildAgentScopeMetadata(
  context: AgentChatContext,
): Record<string, unknown> {
  return context.scope
    ? { agentScope: toAgentScopeMetadata(context.scope) }
    : {};
}
