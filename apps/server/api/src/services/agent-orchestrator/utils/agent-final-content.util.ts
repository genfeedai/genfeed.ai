import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { type AgentUiAction } from '@genfeedai/contracts/interfaces';

/**
 * Normalize empty/partial assistant content into a user-facing final string,
 * including batch-result card cleanup and voice-clone fallbacks.
 */
export function normalizeFinalAssistantContent(
  content: string,
  toolCalls: ToolCallSummary[],
  uiActions: AgentUiAction[],
): { content: string; isFallback: boolean } {
  const hasTurboRunResultCard = uiActions.some(
    (action) => action.type === 'turbo_run_result_card',
  );

  if (content.trim().length > 0) {
    if (hasTurboRunResultCard) {
      const normalizedTurboContent = content
        .replace(/^\s*TurboRun Details:\s*$/gim, '')
        .replace(/^\s*TurboRun ID:.*$/gim, '')
        .replace(/^\s*Status:.*$/gim, '')
        .replace(/^\s*Credits used:.*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      return {
        content:
          normalizedTurboContent.length > 0
            ? normalizedTurboContent
            : 'Your batch is in motion. The latest status is below.',
        isFallback: false,
      };
    }

    return { content, isFallback: false };
  }

  if (toolCalls.length === 0 && uiActions.length === 0) {
    return { content, isFallback: false };
  }

  const hasVoiceCloneSetup = toolCalls.some(
    (toolCall) =>
      toolCall.status === 'completed' &&
      toolCall.toolName === 'prepare_voice_clone',
  );

  if (hasVoiceCloneSetup) {
    return {
      content:
        'I opened voice clone setup below. Upload a sample or pick an existing voice.',
      isFallback: true,
    };
  }

  return { content: 'I prepared the next step below.', isFallback: true };
}
