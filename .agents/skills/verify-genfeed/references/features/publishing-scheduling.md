# Publishing and scheduling

## What exists
Publishing routes: `/publishing` redirects to `/publishing/overview`;
`/publishing/posts` (list, editor at `/publishing/posts/:id`; lifecycle states such as
draft/scheduled/published are query-param filters, not paths), `/publishing/calendar`,
`/publishing/approvals`, `/publishing/campaigns` (+ `/new`). `/publishing/remix` is a
deep-link target for an action only, not a destination.

## How a user reaches it
Sidebar Publishing group, or the org-scoped URL.

## How to drive it
Specs: `playwright/e2e/tests/posts/` (`management`, `post-detail`, `posts-interactions`,
`publishing`, `content-types`), `playwright/e2e/tests/publishing/`
(`post-detail-responsive`, `article-detail-responsive`), `playwright/e2e/tests/calendar/`
(`scheduling`, `calendar-tasks-interactions`, `slot-density`). Page objects:
`posts.page.ts`, `calendar.page.ts`.
API-level publish behavior is the `isolated-publish` tier (no browser).

## What usually breaks
- Time zone: the Playwright project pins `America/New_York`; slot and calendar
  assertions break if a spec builds dates in another zone.
- Never publish for real. Connections/platform calls are cost- and side-effect-risk hosts
  and are blocked by the network guard; verify scheduling state, not delivery.
- State filters are query params; assert the param, not a path segment.
- `isolated-publish` is API-only and has its own tier command in `docs/e2e-tiers.md`.
