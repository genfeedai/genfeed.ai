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
  // A Storyboard run; `/storyboard/new` is the create form.
  new RegExp(`^${APP_ROUTES.STUDIO.STORYBOARD}/(?!new/?$)[^/]+/?$`),
];

export function isAgentOutputRoute(normalizedPathname: string): boolean {
  return AGENT_OUTPUT_ROUTE_PATTERNS.some((pattern) =>
    pattern.test(normalizedPathname),
  );
}
