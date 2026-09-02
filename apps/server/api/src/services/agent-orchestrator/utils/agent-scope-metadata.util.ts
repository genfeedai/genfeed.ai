import type {
  AgentChatContext,
  AgentChatResult,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  toAgentScopeMetadata,
  type ValidatedAgentScope,
} from '@genfeedai/interfaces';

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
