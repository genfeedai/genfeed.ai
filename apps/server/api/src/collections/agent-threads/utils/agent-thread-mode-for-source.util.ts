import { AgentThreadMode } from '@genfeedai/contracts';

/** Threads started from the browser extension's side panel. */
export const EXTENSION_THREAD_SOURCE = 'extension';

/**
 * Plan mode ends a turn on a plan that waits for approval. The extension's
 * side panel cannot show or approve a plan (its turns send
 * `hostSupportsApproval: false`), so a plan there is a paused run nobody can
 * resume. Its threads never plan, whatever the user's saved default is.
 */
export function canThreadSourceReviewPlans(
  source: string | null | undefined,
): boolean {
  return source !== EXTENSION_THREAD_SOURCE;
}

/**
 * The mode a new thread starts in: the user's saved default, except Plan
 * becomes Auto where the host cannot review a plan. Auto keeps the same
 * approval and outbound gates as Plan's approved steps.
 */
export function resolveThreadModeForSource(
  savedMode: AgentThreadMode,
  source: string | null | undefined,
): AgentThreadMode {
  return savedMode === AgentThreadMode.PLAN &&
    !canThreadSourceReviewPlans(source)
    ? AgentThreadMode.AUTO
    : savedMode;
}
