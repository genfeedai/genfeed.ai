import type { AgentStreamEffectsService } from '@api/services/agent-orchestrator/agent-stream-effects.service';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentToolRoundStrategy } from '@api/services/agent-orchestrator/interfaces/agent-turn-round-runner.interface';
import type { AgentUIBlocksEvent } from '@genfeedai/contracts/interfaces';

/**
 * Tool-round strategy for a live-streamed turn: tool lifecycle events publish
 * to the run's stream, and the run's cancellation flag is checked around every
 * tool.
 */
export function buildStreamToolRoundStrategy(input: {
  context: AgentChatContext;
  isRunCancelled: () => Promise<boolean>;
  streamEffects: AgentStreamEffectsService;
  threadId: string;
}): AgentToolRoundStrategy {
  const { context, isRunCancelled, streamEffects, threadId } = input;

  return {
    deferUnknownToolFailure: true,
    logParseErrors: false,
    onAfterTool: async () => ((await isRunCancelled()) ? 'cancel' : 'continue'),
    onBeforeTool: async () =>
      (await isRunCancelled()) ? 'cancel' : 'continue',
    onToolCompleted: async (event) => {
      if (event.kind === 'unknown') {
        await streamEffects.publishStreamingToolCompleted({
          context,
          debug: {
            error: event.summary.error,
            parameters: event.parameters,
          },
          detail: event.summary.error,
          durationMs: event.summary.durationMs,
          error: event.summary.error,
          label: event.requestedToolName,
          parameters: event.parameters,
          resultSummary: event.summary.error,
          status: 'failed',
          threadId,
          toolCallId: event.toolCallId,
          toolName: event.requestedToolName,
        });
        return;
      }

      if (event.kind === 'insufficient_credits') {
        await streamEffects.publishStreamingToolCompleted({
          context,
          debug: {
            error: event.summary.error,
            parameters: event.parameters,
          },
          detail: event.summary.error,
          durationMs: event.summary.durationMs,
          error: event.summary.error,
          parameters: event.parameters,
          resultSummary: event.summary.error,
          status: 'failed',
          threadId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        });
        return;
      }

      await streamEffects.publishStreamingToolCompleted({
        context,
        creditsUsed: event.summary.creditsUsed,
        debug: event.summary.error
          ? {
              error: event.summary.error,
              parameters: event.parameters,
              result: event.result?.data,
            }
          : {
              parameters: event.parameters,
              result: event.result?.data,
            },
        detail:
          event.summary.status === 'completed'
            ? (event.summary.resultSummary ?? `${event.toolName} completed`)
            : event.summary.error,
        durationMs: event.durationMs,
        error: event.summary.error,
        parameters: event.parameters,
        resultSummary: event.summary.resultSummary,
        status: event.summary.status,
        threadId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        uiActions: event.result?.nextActions,
      });
    },
    onToolStarted: async (event) => {
      await streamEffects.publishStreamingToolStarted({
        context,
        parameters: event.parameters,
        startedAt: new Date(event.startTime).toISOString(),
        threadId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      });
    },
    onUiBlocks: async (event) => {
      if (event.deferPublish) {
        return;
      }
      await streamEffects.publishStreamUiBlocks({
        blockIds: event.blockIds,
        blocks: event.blocks as AgentUIBlocksEvent['blocks'],
        context,
        operation: event.operation,
        runId: context.executionId,
        threadId,
      });
    },
  };
}
