# Genfeed App Navigation Audit

Date: 2026-07-08

## Audit Scope

- Product: Genfeed SaaS app.
- Start URL: `https://app.genfeed.ai/genfeed/genfeedai/workspace/overview`
- Related org settings URL: `https://app.genfeed.ai/genfeed/~/settings/webhooks`
- Reference mockup: `_private/views/app-switcher-options-temp.html`, option C compact grid.
- Screenshot evidence was captured locally during the audit but is not required
  for this text issue log.

## User Goal And Accessibility Target

Users should be able to move across workspace, agent, messages, discovery, socials, ads, studio, remix, library, and settings without losing the active org/brand context or encountering disabled, legacy, or ambiguous navigation.

Accessibility target: clear labels, visible state, keyboard-reachable navigation, no misleading active/disabled controls, and predictable routing for org-scoped versus brand-scoped pages.

## Issue 1 - Resolved: Next dev navigation was blocked by unresolved `@genfeedai/api-types/contracts`

Severity: P0 local/dev blocker, fixed in this audit pass

### Actual

Authenticated route sweep against `http://local.genfeed.ai:3000` returned `500` for every audited route after the app compiled the organization webhooks settings page.

Observed routes returning `500` with `Module not found`:

| Route | Status | Error |
| --- | ---: | --- |
| `/genfeed/genfeedai/workspace/overview` | 500 | `Module not found` |
| `/genfeed/~/workspace/overview` | 500 | `Module not found` |
| `/genfeed/~/agent` | 500 | `Module not found` |
| `/genfeed/~/agent/new` | 500 | `Module not found` |
| `/genfeed/genfeedai/messages` | 500 | `Module not found` |
| `/genfeed/~/overview` | 500 | `Module not found` |
| `/genfeed/genfeedai/research/discovery` | 500 | `Module not found` |
| `/genfeed/genfeedai/research/socials` | 500 | `Module not found` |
| `/genfeed/genfeedai/research/ads` | 500 | `Module not found` |
| `/genfeed/~/studio/image` | 500 | `Module not found` |
| `/genfeed/genfeedai/studio/image` | 500 | `Module not found` |
| `/genfeed/~/posts` | 500 | `Module not found` |
| `/genfeed/genfeedai/posts/remix` | 500 | `Module not found` |
| `/genfeed/~/library` | 500 | `Module not found` |
| `/genfeed/genfeedai/library/ingredients` | 500 | `Module not found` |
| `/genfeed/~/settings/webhooks` | 500 | `Module not found` |
| `/genfeed/genfeedai/settings` | 500 | `Module not found` |

The failing import is in `apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/webhooks/content.tsx:4-7`:

```ts
import {
  PUBLISH_WEBHOOK_EVENT_TYPES,
  type PublishWebhookEventType,
} from '@genfeedai/api-types/contracts';
```

`packages/api-types/package.json` exports `./contracts` from `./dist/contracts/index.js`, but the workspace does not currently have `packages/api-types/dist/`. The source contract exists at `packages/api-types/src/contracts/index.ts`.

### Expected

Local `dev:app:fe` should compile all protected routes. The webhooks page should not poison unrelated route testing.

### Fix Applied

Changed `apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/webhooks/content.tsx` to use the local workspace alias:

```ts
import {
  PUBLISH_WEBHOOK_EVENT_TYPES,
  type PublishWebhookEventType,
} from '@api-types/contracts';
```

Focused verification after the change:

| Route | Status | Title | Error |
| --- | ---: | --- | --- |
| `/genfeed/~/settings/webhooks` | 200 | `Webhooks | Genfeed.ai` | none |
| `/genfeed/genfeedai/workspace/overview` | 200 | `Workspace Dashboard | Genfeed.ai` | none |

### Follow-up Hardening

Choose one local workspace resolution strategy and apply it consistently:

- Build or watch `@genfeedai/api-types` before starting `dev:app:fe`.
- Add a dev alias so `@genfeedai/api-types/contracts` resolves to `packages/api-types/src/contracts/index.ts`.
- Move webhooks UI imports to an app-local/client package path that is already resolvable in dev.

Add a focused dev-start guard or single route smoke test for `/genfeed/~/settings/webhooks` so this fails before a manual navigation audit.

## Issue 2 - Resolved in local code: App switcher still ships the old vertical grouped design, not the compact grid

Severity: P1 UX regression against approved direction, fixed in this audit pass

### Actual

The provided production screenshot shows the old app switcher:

- Header says `Switch app`.
- It is a vertical grouped list with descriptions.
- Groups include `Home`, `Trends`, and `Create`.
- The menu has a narrow list width and no search field.

Original source confirmed the shipped implementation in `packages/ui/src/components/shell/app-switcher/AppSwitcher.tsx`:

- `APP_SWITCHER_SECTIONS` defines grouped sections at lines 51-279.
- `AppSwitcherMenuItem` renders icon, label, and description in a vertical list at lines 398-451.
- `DropdownMenuContent` renders `Switch app` plus mapped sections at lines 556-588.

### Expected

The app switcher should match `_private/views/app-switcher-options-temp.html`, option C:

- Header row: `APPS` plus current workspace label.
- Search input visible.
- Compact 3-column grid.
- One label per app tile.
- Active tile state matching the mock.
- Initial grid entries: Workspace, Agent, Messages, Discovery, Socials, Ads, Studio, Remix, Library.

### Fix Applied

`packages/ui/src/components/shell/app-switcher/AppSwitcher.tsx` now renders:

- Header row with `Apps` and current org/brand slug label.
- Visible `Search apps` field.
- Compact 3-column tile grid.
- Primary default entries: Workspace, Agent, Messages, Discovery, Socials, Ads, Studio, Remix, Library.
- Search-backed access to secondary/admin destinations.
- Active secondary page appended to the default grid so the current app stays visible.

Focused verification:

```text
bunx biome check packages/ui/src/components/shell/app-switcher/AppSwitcher.tsx packages/ui/src/components/shell/app-switcher/AppSwitcher.test.tsx apps/app/app/'(protected)'/'[orgSlug]'/~/settings/'(pages)'/organization/webhooks/content.tsx
bun run test src/components/shell/app-switcher/AppSwitcher.test.tsx
```

### Follow-up Hardening

Continue with the route-scope fixes from issues 3-6 so compact presentation does not mask the brand/global context bugs.

## Issue 3 - Entering Agent clears brand route scope and makes the switcher route to org-level fallbacks

Severity: P1 navigation/context loss

### Actual

`AppProtectedTopbar` treats route props as authoritative. On explicit org routes like `/:org/~/...`, it intentionally leaves `effectiveBrandSlug` undefined:

- `apps/app/src/components/shell/AppProtectedTopbar.tsx:68-83`
- `AppSwitcher` receives `brandSlug={effectiveBrandSlug}` at lines 229-237.

The Agent app route is org-scoped only:

- `packages/ui/src/components/shell/app-switcher/AppSwitcher.tsx:67-74`
- Route resolves to `createOrganizationAppRoute(org, '/agent')`.

After the user enters `/genfeed/~/agent`, `brandSlug` is no longer passed into the app switcher. Several brand-dependent app links degrade to org-level fallback routes:

| App switcher item | Brand route when brand exists | Route after Agent clears brand |
| --- | --- | --- |
| Messages | `/:org/:brand/messages` | `/:org/~/overview` |
| Discovery | `/:org/:brand/research/discovery` | `/:org/~/overview` |
| Socials | `/:org/:brand/research/socials` | `/:org/~/overview` |
| Ads | `/:org/:brand/research/ads` | `/:org/~/overview` |
| Remix | `/:org/:brand/posts/remix` | `/:org/~/posts` |
| Post Analytics | `/:org/:brand/analytics/posts` | `/:org/~/analytics/overview` |
| Trend Analytics | `/:org/:brand/analytics/trends` | `/:org/~/analytics/overview` |

### Expected

Entering Agent should not make the rest of the app switcher forget the last active brand. If Agent is global, that state should be explicit without corrupting brand-scoped navigation.

### Suggested Fix

Model the switcher scope explicitly:

- `currentScope: 'organization' | 'brand'`
- `activeBrandSlug?: string`
- `lastBrandSlugForOrg?: string`

Agent can remain org-scoped, but the switcher should use the last active brand for apps that require brand scope, or show disabled/explained states for brand-only apps when no brand can be resolved.

## Issue 3A - Resolved in local code: Full-width page body content did not share the header gutter

Severity: P2 layout consistency bug, fixed in this audit pass

### Actual

The shared `Container` component kept the root full-width so header dividers could span the content pane, then applied `px-5 sm:px-6 lg:px-6` only to the visible header, left slot, and tabs. Body children rendered without that inset.

On Library pages this made content below the header start against the content/sidebar boundary while the page header remained correctly inset.

### Expected

Full-width page content should share the same horizontal gutter as the page header and action row. Constrained pages should keep their root padding and must not receive double body padding.

### Fix Applied

`packages/ui/src/components/layout/container/Container.tsx` now wraps body children in the same full-width inset class used by the header.

Focused verification:

```text
bunx biome check packages/ui/src/components/layout/container/Container.tsx packages/ui/src/components/layout/container/Container.test.tsx
bun run test src/components/layout/container/Container.test.tsx
bun run design:lint
```

Route/browser checks:

| Check | Result |
| --- | --- |
| `/genfeed/genfeedai/library/ingredients` | 200, no build/module markers |
| `/genfeed/genfeedai/library/images` | 200, no build/module markers |
| Header group x vs body x on Library landing | `264` vs `264`, delta `0` |

### Product Note

Keep the topbar title as navigation context. Keep the content header when the page needs local description, counts, filters, tabs, or primary actions; otherwise use `titleVisibility="sr-only"` and place actions in the content header/right slot only when they belong to the page content rather than global navigation.

## Issue 3B - Resolved in local code: Dedicated sidebars dropped the expanded-state collapse control

Severity: P1 navigation regression, fixed in this audit pass

### Actual

The shared app layout injected `isCollapsed` and `onToggleCollapse` into the route sidebar wrapper, but `AppProtectedLayoutSidebar` did not declare or forward those props into most dedicated sidebar branches.

Result: Library, Studio, Research, Analytics, Settings, Workflows, Organization, Compose, Editor, and Admin sidebars could render without the visible expanded-state `Collapse sidebar` control. The topbar `Expand sidebar` control still existed after collapse, but users had no obvious way to collapse the sidebar from the expanded state.

There was no related local stash entry.

### Expected

Every protected sidebar branch should receive the same collapse props from `AppLayout`, so expanded sidebars expose `Collapse sidebar` and collapsed sidebars can be restored via `Expand sidebar`.

### Fix Applied

`apps/app/packages/components/AppProtectedLayoutSidebar.tsx` now accepts `isCollapsed` and `onToggleCollapse`, then forwards them to every `AppSidebar` and `AdminSidebar` route branch.

Focused verification:

```text
bunx biome check apps/app/packages/components/AppProtectedLayoutSidebar.tsx apps/app/packages/components/app-protected-layout.test.tsx
bun run test packages/components/app-protected-layout.test.tsx
```

Browser check on `/genfeed/genfeedai/library/images` confirmed:

| Check | Result |
| --- | --- |
| Desktop sidebar rail attached | true |
| `Collapse sidebar` button present while expanded | true |
| `Expand sidebar` button absent while expanded | true |

## Issue 3C - Resolved in local code: Managed credits checkout was rendered on API Keys instead of Credits settings

Severity: P1 information architecture and settings consistency bug, fixed in this audit pass

### Actual

`/default/~/settings/api-keys` rendered the self-hosted `Genfeed managed credits` checkout card above the API key provider management UI.

That mixed two separate jobs:

- Credits purchase/provisioning.
- API keys and provider credentials.

It also made the API Keys page appear to have a one-off card treatment unrelated to the rest of settings.

### Expected

Credits should live under a dedicated organization settings route, `/settings/credits`, and API Keys should focus on Genfeed API keys plus BYOK provider configuration.

### Fix Applied

Added a dedicated Credits settings route and moved the managed credits card there:

- `apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/credits/page.tsx`
- `apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/credits/content.tsx`
- `apps/app/app/(protected)/[orgSlug]/~/settings/(pages)/organization/credits/managed-credits-checkout-card.tsx`

Updated settings navigation and credit CTAs so non-EE credit purchase flows route to `/settings/credits` instead of abusing `/settings/api-keys` or `/settings/billing`.

Focused browser verification against `http://local.genfeed.ai:3000/default` confirmed:

| Route | Result |
| --- | --- |
| `/~/settings/api-keys` | 200, no build errors, no `Genfeed managed credits` card |
| `/~/settings/credits` | 200, no build errors, renders `Genfeed managed credits` and `Get Credits` |

## Issue 4 - Agent has no visible global-vs-brand scope control

Severity: P1 product behavior ambiguity

### Actual

Agent can operate without a selected brand:

- `apps/app/app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient.tsx:51` reads `selectedBrand`.
- `handleOAuthConnect` only sends `{ brand: selectedBrand.id }` if `selectedBrand` exists at lines 113-117.
- Route navigation stays org-scoped through `orgHref(...)` at lines 118-124.

The brand provider also clears the effective brand ID on org routes:

- `packages/contexts/user/brand-context/useBrandProviderState.ts:220-224` identifies org routes when `brandSlug` is absent.
- `packages/contexts/user/brand-context/useBrandProviderState.ts:280-286` returns an empty effective brand ID on org routes.

The test fixture is misleading because it mocks `brandSlug` for the org-scoped Agent layout:

- `apps/app/app/(protected)/[orgSlug]/~/agent/AgentWorkspaceLayoutClient.spec.tsx:12-18`
- Reset repeats `{ orgSlug: 'acme-org', brandSlug: 'acme-creator' }` at lines 105-109.

### Expected

Agent should communicate whether it is acting globally for the organization or scoped to a brand. Brand-scoped actions such as OAuth/connect should be visibly tied to a brand when applicable.

### Suggested Fix

Add an Agent scope selector or scope badge in the Agent surface:

- Global org mode: `All brands` or `Organization`
- Brand mode: selected brand name and slug

Thread creation, OAuth connect, and agent tool calls should carry the resolved scope. Update Agent tests so the default route shape matches `[orgSlug]/~/agent` and add explicit cases for brand-scoped context.

## Issue 5 - Brand dropdown remains enabled on organization settings routes

Severity: P2 scope affordance bug

### Actual

On `/:org/~/settings/...`, settings scope is organization-level:

- `apps/app/packages/components/useAppProtectedLayout.ts:506-513`

But the topbar still renders `MenuBrandSwitcher` whenever brands exist:

- `apps/app/src/components/shell/AppProtectedTopbar.tsx:166-175`

This matches the user's observation: on `https://app.genfeed.ai/genfeed/~/settings/webhooks`, the route says organization scope (`~`) but the topbar still presents a brand dropdown.

### Expected

Organization settings should not look brand-scoped. The brand dropdown should either be hidden, disabled with an organization-scope label, or replaced with an explicit org-scope indicator.

### Suggested Fix

Gate `MenuBrandSwitcher` on the route scope:

- Hide or disable it for `/:org/~/settings`.
- Keep it enabled on brand settings `/:org/:brand/settings`.
- If product wants fast switching from org settings into brand settings, make the target route explicit and do not imply the current page is scoped to that brand.

## Issue 6 - Org-scoped fallback routes are too lossy for repeated navigation

Severity: P2 navigation quality

### Actual

Several app switcher entries use broad org fallbacks when `brandSlug` is absent:

- Messages, Discovery, Socials, and Ads route to `/:org/~/overview`.
- Remix, Review, Calendar, and Scheduled route to `/:org/~/posts`.
- Post Analytics and Trend Analytics route to `/:org/~/analytics/overview`.

This means the label the user clicks does not map to the destination they land on once they are in org scope.

### Expected

Each switcher entry should either navigate to the matching product area or clearly indicate that it requires a brand selection.

### Suggested Fix

Audit every app switcher route and classify it:

- Organization-native: route directly under `/:org/~/...`
- Brand-native: use current or last active brand
- Unsupported without brand: disabled with a tooltip or opens brand selection first

Avoid generic `/overview` fallbacks for app-specific entries.

## Working Notes

- `dev:app:be` is running locally on `http://local.genfeed.ai:3010`.
- `dev:app:fe` is running locally on `http://local.genfeed.ai:3000`.
- Magic-link auth was generated from the internal dev log and consumed into a local cookie jar. Session lookup confirms `vincent@genfeed.ai` is authenticated.
- Spark CLI was available, but local Resend is skipped, so the email was not delivered to Spark. The internal log was the correct local source for the magic link.
- Codex Preview was requested, but this session exposes no callable Preview/browser tool and the visible Codex side panel did not surface a Preview pane. Evidence uses local authenticated HTTP requests, dev logs, source inspection, and the user-provided production screenshots.

## Evidence Limits

- This is not a full WCAG conformance review.
- Click-by-click visual coverage is currently blocked locally by issue 1.
- The app switcher design finding is grounded in the user's production screenshot plus source inspection.
- Route behavior was audited against local dev after authenticated magic-link login.
