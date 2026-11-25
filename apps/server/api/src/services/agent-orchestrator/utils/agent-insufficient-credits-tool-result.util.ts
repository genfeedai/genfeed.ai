import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type {
  AgentToolRoundState,
  AgentToolRoundStrategy,
  ExecuteToolRoundParams,
} from '@api/services/agent-orchestrator/interfaces/agent-turn-round-runner.interface';
import type { CuratedActionName } from '@genfeedai/actions';
import { traced } from '@libs/tracing/traced';

/**
 * Records a priced tool call the organization cannot pay for: the failed
 * summary on the turn, the `insufficient_credits` completion event, and the
 * tool message the model reads. The tool never ran.
 */
export const recordInsufficientToolCredits = traced(
  'recordInsufficientToolCredits',
  async (input: {
    messages: ExecuteToolRoundParams['messages'];
    preflightCreditCost: number;
    requestedToolName: CuratedActionName;
    startTime: number;
    state: AgentToolRoundState;
    strategy: AgentToolRoundStrategy;
    toolCallId: string;
    toolName: string;
    toolParams: Record<string, unknown>;
  }): Promise<void> => {
    const durationMs = Date.now() - input.startTime;
    const summary: ToolCallSummary = {
      creditsUsed: 0,
      durationMs,
      error: `Insufficient credits (need ${input.preflightCreditCost})`,
      status: 'failed',
      toolName: input.toolName,
    };
    input.state.toolCalls.push(summary);
    if (input.strategy.onToolCompleted) {
      await input.strategy.onToolCompleted({
        durationMs,
        kind: 'insufficient_credits',
        parameters: input.toolParams,
        requestedToolName: input.requestedToolName,
        summary,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
      });
    }
    input.messages.push({
      content: JSON.stringify({
        error: `Insufficient credits. This tool requires ${input.preflightCreditCost} credits.`,
        success: false,
      }),
      role: 'tool' as const,
      tool_call_id: input.toolCallId,
    });
  },
);
