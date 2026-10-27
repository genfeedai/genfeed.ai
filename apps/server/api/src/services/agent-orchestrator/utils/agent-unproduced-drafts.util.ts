import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { type AgentUiAction } from '@genfeedai/contracts/interfaces';

/**
 * Sent once when the model announces finished drafts that this turn never
 * produced, so the next round writes them instead of only saying so.
 */
export const AGENT_UNPRODUCED_DRAFTS_INSTRUCTION =
  'Your last reply said drafts are ready, but this turn produced no draft text and no draft card. Write the drafts now: put the full text of each draft in your reply, or call the tool that creates them. Do not announce drafts you have not written.';

export const AGENT_UNPRODUCED_DRAFTS_FALLBACK =
  'I have not written the drafts yet. Ask me to go ahead and I will put each draft in the reply.';

const DRAFT_WORD = /\bdrafts?\b/i;
const READY_WORD =
  /\b(?:ready|written|prepared|done|complete|finished|attached|above|below|wrote|drafted|created|here(?:'s|\s+(?:are|is)))\b/i;
// Promises, offers and negations are not claims that drafts exist.
const NOT_A_CLAIM =
  /\b(?:not|no|yet|will|won't|can|could|would|should|shall|let me|want|once|when|after|before|if|need)\b|n't|\?\s*$/i;
const PRODUCING_TOOL =
  /draft|generate_content|generate_social|create_post|create_article/;
const MIN_BODY_LINE_LENGTH = 30;

function sentencesOf(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function isDraftClaim(sentence: string): boolean {
  return (
    DRAFT_WORD.test(sentence) &&
    READY_WORD.test(sentence) &&
    !NOT_A_CLAIM.test(sentence)
  );
}

/**
 * True when the reply says drafts are ready (or above/below) but the turn has
 * no draft in it: no card other than next steps, no draft-producing tool
 * result, and no draft text in the reply itself.
 */
export function claimsUnproducedDrafts(
  content: string,
  toolCalls: ToolCallSummary[],
  uiActions: AgentUiAction[],
): boolean {
  const sentences = sentencesOf(content);
  if (!sentences.some(isDraftClaim)) return false;
  if (uiActions.some((action) => action.type !== 'next_steps_card'))
    return false;
  if (
    toolCalls.some(
      (toolCall) =>
        toolCall.status === 'completed' &&
        PRODUCING_TOOL.test(toolCall.toolName),
    )
  )
    return false;
  const bodyLines = sentences.filter(
    (sentence) =>
      !isDraftClaim(sentence) && sentence.length >= MIN_BODY_LINE_LENGTH,
  );
  return bodyLines.length < 2;
}

/** Drops the draft claims; an empty reply becomes a plain statement. */
export function withdrawUnproducedDraftClaims(content: string): string {
  const kept = sentencesOf(content).filter(
    (sentence) => !isDraftClaim(sentence),
  );
  return kept.length > 0 ? kept.join('\n') : AGENT_UNPRODUCED_DRAFTS_FALLBACK;
}
