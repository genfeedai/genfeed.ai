import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { resolveAgentConversationRoute } from '@/lib/navigation/operator-shell';

/**
 * Routes whose page renders `AgentOutputShell`: the agent on the left, the
 * page output on the right. The shell turns the product dock off on these (a
 * second Chat toggle beside the page's own agent would be a third column) and
 * moves the conversation composer in flow. Patterns match the normalized
 * pathname, so no org or brand segment. A page that wraps itself in
 * `AgentOutputShell` adds its route here in the same change.
 */
const AGENT_OUTPUT_ROUTE_PATTERNS: readonly RegExp[] = [
  // The master conversation beside the Threads list (`/agent`,
  // `/agent/threads`) or one open thread (`/agent/[id]`). `/agent/new` and
  // `/agent/[id]?view=full` are the one full-width conversation.
  new RegExp(`^${APP_ROUTES.AGENT.ROOT}(?:/(?!new/?$|journey/?$)[^/]+)?/?$`),
  // Turbo: `/turbo` is the prompt that starts a project beside the project
  // list, `/turbo/[projectId]` is one open project.
  new RegExp(`^${APP_ROUTES.STUDIO.TURBO}(?:/[^/]+)?/?$`),
  // Storyboard: `/storyboard` is the prompt that starts a run beside the run
  // list, `/storyboard/[runId]` is one open run.
  new RegExp(`^${APP_ROUTES.STUDIO.STORYBOARD}(?:/[^/]+)?/?$`),
  // Motion: `/motion` is the prompt that starts a project beside the project
  // list, `/motion/[projectId]` is one open project.
  new RegExp(`^${APP_ROUTES.STUDIO.MOTION}(?:/[^/]+)?/?$`),
  // The workflow editor, new or saved; `/automation/workflows/templates` is
  // the template gallery and stays on the dock.
  new RegExp(`^${APP_ROUTES.AUTOMATION.WORKFLOWS}/(?!templates/?$)[^/]+/?$`),
  // Clipper workspace and its open project.
  new RegExp(`^${APP_ROUTES.STUDIO.CLIPPER}(?:/[^/]+)?/?$`),
  // Editor: `/editor` is the prompt that starts a project beside the project
  // list, `/editor/[projectId]` is one open project.
  new RegExp(`^${APP_ROUTES.STUDIO.EDITOR}(?:/[^/]+)?/?$`),
];

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
  return AGENT_OUTPUT_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(normalizedPathname),
  );
}
