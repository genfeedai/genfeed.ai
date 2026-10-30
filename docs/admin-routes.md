# Admin route map

The admin app mirrors the product app: a flat list at `/admin/<things>` and a
detail at `/admin/<things>/:id`. Routes are hard cuts: a renamed route is
deleted, not redirected.

## Rules

| Part | Rule | Example |
| --- | --- | --- |
| Id | A path segment, never a query param. | `/admin/organizations/:id` |
| View | A type that changes what the list shows is a path segment, like `/library/videos` in the app. | `/admin/content/ingredients/videos`, `/admin/configuration/tags/:filter`, `/admin/automation/models/:type` |
| Filter | Status, organization, brand, search and dates are query params, set from the shared Filters menu or the organization/brand picker. | `/admin/content/ingredients?organization=:id` |
| Depth | No nesting by parent. The organization is a filter on a list, not a parent route. | `/admin/brands/:id`, not `/admin/organizations/:id/brands/:brandId` |
| Tabs | A tab of one entity page is a query param. | `/admin/organizations/:id?tab=settings` |

`scripts/architecture/check-admin-route-convention.ts` (part of
`bun run check:architecture`) fails on:

- a detail page (`[id]` or `[somethingId]`) with no list page in its parent
  route (route groups like `(library)` are not URL segments);
- an `APP_ROUTES.ADMIN` constant that carries `?id=`.

It does not forbid query filters.

## Lists and details

| List | Detail | Notes |
| --- | --- | --- |
| `/admin/organizations` | `/admin/organizations/:id` | Analytics tab (default) and `?tab=settings` |
| `/admin/brands` | `/admin/brands/:id` | Platform view at `/admin/brands/:id/platforms/:platform` |
| `/admin/administration/users` | `/admin/administration/users/:id` | |
| `/admin/content/posts` | `/admin/content/posts/:id` | |
| `/admin/content/templates` | `/admin/content/templates/:id` | |
| `/admin/content/ingredients` | `/admin/content/ingredients/:type/:id` | The in-app `LibraryBrowser` across all organizations; `:type` is `images`, `videos`, `gifs`, `music` or `avatars`. Detail exists for `images` and `videos`. |
| `/admin/automation/models` | `/admin/automation/models/:type/:modelId` | `:type` is a view of the list |
| `/admin/automation/trainings` | `/admin/automation/trainings/:id` | `/admin/automation/trainings/:id/sources` for sources |

## Lists with views

| Route | Views |
| --- | --- |
| `/admin/configuration/tags` | `/admin/configuration/tags/:filter` |
| `/admin/automation/models` | `/admin/automation/models/:type` |
| `/admin/content/ingredients` | `/admin/content/ingredients/:type` |

## Sections without a detail

`/admin/overview` (with `/activities`, `/analytics/all`, `/analytics/business`),
`/admin/economics` (`/overview`, `/costs`, `/organizations`, `/revenue`),
`/admin/administration` (`/announcements`, `/concierge-accounts`, `/learning`,
`/referrals`, `/roles`, `/subscriptions`, `/system-emails`),
`/admin/automation` (`/agents`, `/bots`, `/failures`, `/workflows`),
`/admin/configuration` (`/elements/*`, `/font-families`, `/presets`),
`/admin/content/generations`, `/admin/folders`, `/admin/library/voices`,
`/admin/flags` and `/admin/settings/*`.
