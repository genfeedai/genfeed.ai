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
  // The Library asset browser: every destination that renders `LibraryBrowser`
  // (the unified browser, its type presets, places and shelves). Overview,
  // References, Voices and Captions have their own pages and keep the dock.
  new RegExp(
    `^(?:${[
      APP_ROUTES.LIBRARY.ASSETS,
      APP_ROUTES.LIBRARY.AVATARS,
      APP_ROUTES.LIBRARY.GIFS,
      APP_ROUTES.LIBRARY.IMAGES,
      APP_ROUTES.LIBRARY.IMPORTED,
      APP_ROUTES.LIBRARY.MUSIC,
      APP_ROUTES.LIBRARY.RECENT,
      APP_ROUTES.LIBRARY.STARRED,
      APP_ROUTES.LIBRARY.TRASH,
      APP_ROUTES.LIBRARY.VIDEOS,
      `${APP_ROUTES.LIBRARY.SHELF}/[^/]+`,
    ].join('|')})/?$`,
  ),
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
