import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';

const GENERIC_DONE_COPY = new Set([
  'generated content for this request.',
  'generated content for this request',
  'done',
  'completed',
]);

function isGenericDoneCopy(value: string | undefined): boolean {
  if (!value?.trim()) {
    return true;
  }
  return GENERIC_DONE_COPY.has(value.trim().toLowerCase());
}

/**
 * Hide the sticky "Done" card when it adds no signal beyond a sibling product
 * card (batch result / content preview) — especially all-failed batches.
 * Keeps T3/Codex density: one result surface per turn, not stacked chrome.
 */
export function shouldRenderCompletionSummary(
  action: AgentUiAction,
  siblingActions: readonly AgentUiAction[],
): boolean {
  if (action.type !== 'completion_summary_card') {
    return false;
  }

  const hasMedia =
    (action.outputVariants?.length ?? 0) > 0 ||
    (action.secondaryCtas?.length ?? 0) > 0;

  if (hasMedia) {
    return true;
  }

  const batchResult = siblingActions.find(
    (sibling) => sibling.type === 'batch_generation_result_card',
  );
  if (batchResult) {
    const completed = batchResult.completedCount ?? 0;
    const failed = batchResult.failedCount ?? 0;
    // All failed or empty batch — result card owns the story; Done is noise.
    if (completed === 0 && failed > 0) {
      return false;
    }
    // Batch result already has title/description/metrics — drop generic Done.
    if (
      isGenericDoneCopy(action.summaryText) &&
      isGenericDoneCopy(action.description) &&
      !action.outcomeBullets?.length
    ) {
      return false;
    }
  }

  const contentPreview = siblingActions.find(
    (sibling) => sibling.type === 'content_preview_card',
  );
  if (
    contentPreview &&
    isGenericDoneCopy(action.summaryText) &&
    isGenericDoneCopy(action.description) &&
    !action.outcomeBullets?.length
  ) {
    return false;
  }

  return true;
}
