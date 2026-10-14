import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';

const AGENT_CONVERSATION_ID_EXCLUSIONS = new Set([
  'journey',
  'new',
  'onboarding',
]);

const STORYBOARD_RUN_ID_EXCLUSIONS = new Set(['new']);

/** Max chars for agent conversation leaf in topbar breadcrumb. */
export const BREADCRUMB_CONVERSATION_TITLE_MAX = 25;

export function extractAgentConversationId(
  pathname: string | null,
): string | null {
  if (!pathname) {
    return null;
  }
  const normalized = normalizeProtectedPathname(pathname);
  const match = normalized.match(/^\/agent\/([^/]+)\/?$/);
  const conversationId = match?.[1];
  if (!conversationId || AGENT_CONVERSATION_ID_EXCLUSIONS.has(conversationId)) {
    return null;
  }
  return conversationId;
}

/** The run id of a `/studio/storyboard/:runId` detail route, else `null`. */
export function extractStoryboardRunId(pathname: string | null): string | null {
  if (!pathname) {
    return null;
  }
  const normalized = normalizeProtectedPathname(pathname);
  const runId = normalized.match(/^\/studio\/storyboard\/([^/]+)\/?$/)?.[1];
  if (!runId || STORYBOARD_RUN_ID_EXCLUSIONS.has(runId)) {
    return null;
  }
  return runId;
}

export function truncateBreadcrumbLabel(
  label: string,
  maxLength = BREADCRUMB_CONVERSATION_TITLE_MAX,
): string {
  const trimmed = label.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}…`;
}
