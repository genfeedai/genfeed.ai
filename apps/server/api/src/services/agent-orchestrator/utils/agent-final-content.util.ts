import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  claimsUnproducedDrafts,
  withdrawUnproducedDraftClaims,
} from '@api/services/agent-orchestrator/utils/agent-unproduced-drafts.util';
import { type AgentUiAction } from '@genfeedai/contracts/interfaces';

const TURBO_DETAILS_HEADING_LINES_PATTERN =
  /^\s*Turbo(?: run)? Details:\s*$/gim;
const TURBO_ID_LINES_PATTERN = /^\s*Turbo(?: run)? ID:.*$/gim;
const STATUS_LINES_PATTERN = /^\s*Status:.*$/gim;
const CREDITS_USED_LINES_PATTERN = /^\s*Credits used:.*$/gim;
const EXCESS_BLANK_LINES_PATTERN = /\n{3,}/g;
const CREATED_POST_CLAIM_PATTERN =
  /\b(?:I(?:['’]ve| have)?|We(?:['’]ve| have)?)\s+created\s+(?:(?:a|the|your)\s+)?(?:post(?:\s+draft)?|draft(?:\s+post)?)(?!\s+(?:post|draft|proposal)\b)\b/gi;
const POST_STATUS_CLAIM_PATTERN =
  /\b(?:(no)\s+)?(?:(?:the|your|a)\s+)?(?:post(?:\s+draft)?|draft(?:\s+post)?)\s+(?:(?:was|is)\s+|has\s+been\s+)?created\b/gi;

/**
 * Normalize empty/partial assistant content into a user-facing final string,
 * including Turbo run result card cleanup and voice-clone fallbacks.
 */
export function normalizeFinalAssistantContent(
  assistantContent: string,
  toolCalls: ToolCallSummary[],
  uiActions: AgentUiAction[],
): { content: string; isFallback: boolean } {
  const hasTurboRunResultCard = uiActions.some(
    (action) => action.type === 'turbo_run_result_card',
  );

  const hasPendingPostProposal = uiActions.some(
    (action) =>
      action.type === 'mutation_approval_card' &&
      action.title?.trim().toLowerCase() === 'create post' &&
      action.data?.status === 'pending',
  );
  const proposalContent = hasPendingPostProposal
    ? normalizePendingPostContent(assistantContent)
    : assistantContent;
  // Drafts the reply announces but the turn never produced are not shown as
  // finished, even when the corrective round did not fix them.
  const content = claimsUnproducedDrafts(proposalContent, toolCalls, uiActions)
    ? withdrawUnproducedDraftClaims(proposalContent)
    : proposalContent;

  if (content.trim().length > 0) {
    if (hasTurboRunResultCard) {
      const normalizedTurboContent = content
        .replace(TURBO_DETAILS_HEADING_LINES_PATTERN, '')
        .replace(TURBO_ID_LINES_PATTERN, '')
        .replace(STATUS_LINES_PATTERN, '')
        .replace(CREDITS_USED_LINES_PATTERN, '')
        .replace(EXCESS_BLANK_LINES_PATTERN, '\n\n')
        .trim();

      return {
        content:
          normalizedTurboContent.length > 0
            ? normalizedTurboContent
            : 'Your Turbo run is in motion. The latest status is below.',
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

function normalizePendingPostContent(content: string): string {
  if (!content.trim()) {
    return 'Post proposal ready for review. Approve its Create post card to create the post.';
  }

  return content
    .replace(CREATED_POST_CLAIM_PATTERN, 'Post proposal ready for review')
    .replace(
      POST_STATUS_CLAIM_PATTERN,
      (claim: string, negation: string | undefined) =>
        negation ? claim : 'Post proposal ready for review',
    );
}
