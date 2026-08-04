import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';

const AGENT_CONVERSATION_ID_EXCLUSIONS = new Set([
  'journey',
  'new',
  'onboarding',
]);

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
