export interface RenderableThreadStateInput {
  hasLatestProposedPlan: boolean;
  hasPendingInputRequest: boolean;
  isStreaming: boolean;
  messageCount: number;
  pendingUiActionCount: number;
  streamingContentLength: number;
  streamingReasoningLength: number;
  workEventCount: number;
}

/**
 * Whether the conversation track has anything to paint. The empty state must
 * only appear when every source is empty — a pending generation card that has
 * not been folded into a persisted message yet is still renderable content.
 */
export function hasRenderableThreadState(
  input: RenderableThreadStateInput,
): boolean {
  return (
    input.messageCount > 0 ||
    input.hasLatestProposedPlan ||
    input.hasPendingInputRequest ||
    input.workEventCount > 0 ||
    input.pendingUiActionCount > 0 ||
    input.isStreaming ||
    input.streamingContentLength > 0 ||
    input.streamingReasoningLength > 0
  );
}
