import { resolveAgentConversationRoute } from '@/lib/navigation/operator-shell';
import { createAgentOutputMatcher } from './route-manifest.util';

/**
 * Pages that render `AgentOutputShell`: the agent on the left, the page output
 * on the right. The shell turns the product dock off on these (a second Chat
 * toggle beside the page's own agent would be a third column) and moves the
 * conversation composer in flow. A page that wraps itself in
 * `AgentOutputShell` sets `isAgentOutput` on its route manifest entry in the
 * same change; the manifest matches the normalized pathname, so no org or
 * brand segment.
 */
const isAgentOutputPath = createAgentOutputMatcher();

export function isAgentOutputRoute(
  normalizedPathname: string,
  searchParams?: Pick<URLSearchParams, 'get'> | null,
): boolean {
  // A thread opened full size has no output pane beside it. The master routes
  // (`/agent`, `/agent/threads`) keep theirs whatever the query says.
  if (
    resolveAgentConversationRoute(normalizedPathname, searchParams)?.layout ===
    'single'
  ) {
    return false;
  }
  return isAgentOutputPath(normalizedPathname);
}
