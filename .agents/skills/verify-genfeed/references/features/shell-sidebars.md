# Shell and sidebars

## What exists
App chrome: the left rail and sidebars, context sidebar, organization/brand switching,
notification inbox, agent dock, apps browser (`/apps`), and workspace pages
(`overview`, `activity`, `inbox`, `tasks`).

## How a user reaches it
Present on every authed page. The workspace pages and `/apps` have their own routes.

## How to drive it
Specs under `playwright/e2e/tests/shell/`: `chrome-interactions`,
`navigation-interactions`, `context-sidebar`, `sidebar-compatibility`, `agent-dock`,
`notification-inbox`, `organization-context`, `page-context-contract`, `apps-browser`.
Whole-app route coverage: `playwright/e2e/tests/smoke/all-app-pages.spec.ts` (mocked) and
`all-app-pages.authed.spec.ts` (real session), `protected-hydration.spec.ts`.

## What usually breaks
- Route renames are hard cuts; a stale link in the rail shows up as a 404 in
  `all-app-pages`.
- Hydration issues appear only in the authed lane (real cookie + proxy path); the mocked
  tier bypasses `proxy.ts`.
- Notification links must open the target (for example a tool approval opens the
  approval); assert the destination URL.
