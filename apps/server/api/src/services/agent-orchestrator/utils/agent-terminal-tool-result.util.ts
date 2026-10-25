import {
  type CuratedActionName,
  getVisualMediaGenerationType,
} from '@genfeedai/actions';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';

const TERMINAL_RESULT_TOOLS = new Set<CuratedActionName>([
  'suggest_ingredient_alternatives',
]);

export const APPROVAL_PENDING_RESULT_SUMMARY = 'Waiting for your approval';

export interface TerminalToolOutcome {
  content: string;
  toolName: CuratedActionName;
}

/** Visual `generate` results end the turn; voice and music do not. */
function isTerminalResultTool(
  toolName: CuratedActionName,
  parameters: Record<string, unknown>,
): boolean {
  return (
    TERMINAL_RESULT_TOOLS.has(toolName) ||
    getVisualMediaGenerationType(toolName, parameters) !== undefined
  );
}

function getTerminalToolContent(
  toolName: CuratedActionName,
  parameters: Record<string, unknown>,
): string {
  if (toolName === 'ingest_source_media')
    return 'Source needs attention. Retry or add another source.';
  if (toolName === 'request_input') return 'Choose an option to continue.';
  if (toolName === 'suggest_ingredient_alternatives') {
    return 'Here are the ingredient alternatives.';
  }
  if (getVisualMediaGenerationType(toolName, parameters) === 'video') {
    return 'Video generation accepted.';
  }
  return 'Image generation accepted.';
}

export function isApprovalPendingResult(result: AgentToolResult): boolean {
  return result.success && result.approvalStatus === 'pending';
}

/**
 * The tool result that ends the turn, if it does. A pending mutation approval
 * is terminal: nothing runs until the user decides, so another model round
 * would only keep the thread "Working" beside a card that is waiting on them
 * (or retry the tool).
 */
export function resolveTerminalToolOutcome(
  toolName: CuratedActionName,
  parameters: Record<string, unknown>,
  result: AgentToolResult,
): TerminalToolOutcome | undefined {
  if (isApprovalPendingResult(result) && result.nextActions?.length) {
    return {
      content: 'Review the details and approve to continue.',
      toolName,
    };
  }

  const isTerminal =
    (result.success &&
      result.nextActions?.length &&
      isTerminalResultTool(toolName, parameters)) ||
    result.data?.waitingForInput === true;

  return isTerminal
    ? { content: getTerminalToolContent(toolName, parameters), toolName }
    : undefined;
}
