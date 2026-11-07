import { APP_ROUTE_PREFIXES, APP_ROUTES } from '@genfeedai/contracts/constants';

/*
 * Route kinds the protected shell lays itself out by. Pure path checks, so the
 * loading frame can draw the same layout as the shell without loading it.
 * Pathnames are normalized (`normalizeProtectedPathname`) unless noted.
 */

const EDITOR_CANVAS_PATH_PATTERN = /^\/editor\/[^/]+$/;
const WORKFLOW_EDITOR_PATH_PATTERN = /^\/automation\/workflows\/([^/]+)$/;
const AGENT_PATH_PATTERN = /^\/agent(?:\/|$)/;
const APPS_SEGMENT_PATTERN = /\/~\/apps(\/|$)/;

const AUTOMATION_WORKFLOW_RESERVED = new Set([
  'executions',
  'new',
  'templates',
]);

export function isProtectedEditorCanvasRoute(pathname: string): boolean {
  return (
    EDITOR_CANVAS_PATH_PATTERN.test(pathname) ||
    pathname === APP_ROUTES.AUTOMATION.WORKFLOWS_NEW ||
    (WORKFLOW_EDITOR_PATH_PATTERN.test(pathname) &&
      !AUTOMATION_WORKFLOW_RESERVED.has(pathname.split('/')[3] ?? ''))
  );
}

/** The agent conversation owns the left pane, so it renders without a menu column. */
export function isProtectedConversationRoute(pathname: string): boolean {
  return AGENT_PATH_PATTERN.test(pathname);
}

/** Apps take the full width: there is nothing to navigate between. Reads the raw path. */
export function isProtectedAppsRoute(rawPathname: string): boolean {
  return APPS_SEGMENT_PATTERN.test(rawPathname);
}

export function isProtectedWorkspaceRoute(pathname: string): boolean {
  return (
    pathname === APP_ROUTES.WORKSPACE.ROOT ||
    pathname === APP_ROUTES.WORKSPACE.OVERVIEW ||
    pathname.startsWith(`${APP_ROUTE_PREFIXES.WORKSPACE}/`)
  );
}
