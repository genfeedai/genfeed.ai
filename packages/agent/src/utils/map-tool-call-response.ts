import type { AgentToolCallSummary } from '@cloud/agent/models/agent-chat.model';

export function mapToolCallResponse(tc: AgentToolCallSummary) {
  return {
    arguments: tc.parameters ?? {},
    creditsUsed: tc.creditsUsed,
    durationMs: tc.durationMs,
    error: tc.error,
    id: `tc-${Date.now()}-${tc.toolName}`,
    name: tc.toolName,
    parameters: tc.parameters,
    resultSummary: tc.resultSummary,
    status: tc.status,
  };
}
