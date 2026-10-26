import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';

/** The tool-call projection stored on the final assistant message. */
export function toPersistedToolCalls(toolCalls: readonly ToolCallSummary[]) {
  return toolCalls.map((tc) => ({
    creditsUsed: tc.creditsUsed,
    durationMs: tc.durationMs,
    error: tc.error,
    parameters: tc.parameters ?? {},
    result: tc.resultSummary ? { summary: tc.resultSummary } : {},
    status: tc.status,
    toolName: tc.toolName,
  }));
}
