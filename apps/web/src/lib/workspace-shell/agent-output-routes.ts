import { APP_ROUTES } from '@genfeedai/contracts/constants';

/**
 * Routes whose page renders `AgentOutputShell`: the agent on the left, the
 * page output on the right. The shell turns the product dock off on these (a
 * second Chat toggle beside the page's own agent would be a third column) and
 * moves the conversation composer in flow. Patterns match the normalized
 * pathname, so no org or brand segment. A page that wraps itself in
 * `AgentOutputShell` adds its route here in the same change.
 */
const AGENT_OUTPUT_ROUTE_PATTERNS: readonly RegExp[] = [
  // The master conversation; `/agent/new` and `/agent/[id]` stay full-page.
  new RegExp(`^${APP_ROUTES.AGENT.ROOT}/?$`),
  // A Storyboard run, and `/storyboard/new`, where the idea is pitched in the
  // same chat-left, result-right layout the run opens in.
  new RegExp(`^${APP_ROUTES.STUDIO.STORYBOARD}/[^/]+/?$`),
  // The workflow editor, new or saved; `/automation/workflows/templates` is
  // the template gallery and stays on the dock.
  new RegExp(`^${APP_ROUTES.AUTOMATION.WORKFLOWS}/(?!templates/?$)[^/]+/?$`),
  // A Clipper project; `/clipper/new` creates one.
  new RegExp(`^${APP_ROUTES.STUDIO.CLIPPER}/(?!new/?$)[^/]+/?$`),
  // An Editor project; `/editor/new` creates one.
  new RegExp(`^${APP_ROUTES.STUDIO.EDITOR}/(?!new/?$)[^/]+/?$`),
];

export function isAgentOutputRoute(normalizedPathname: string): boolean {
  return AGENT_OUTPUT_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(normalizedPathname),
  );
}
