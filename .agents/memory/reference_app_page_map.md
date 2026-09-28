---
name: app_page_map
description: Current app route/page map for QA review of app switcher, sidebars, org scope, brand scope, and admin surfaces.
type: reference
---

# App Page Map

The route tree is derivable from `apps/app/app/**/page.tsx` and drift-checked by `bun run check:route-inventory` (`scripts/architecture/check-product-route-inventory.ts`); do not hand-maintain a route list here.

The only current hard cuts (`PROTECTED_HARD_CUT_PAGES` / `PROTECTED_HARD_CUT_PREFIXES`, both in
`check-product-route-inventory.ts`) are `/:orgSlug/:brandSlug/lab` and
`/:orgSlug/~/settings/organization*` (organization settings live directly under
`/:orgSlug/~/settings/*`).

Source of truth:

- Next App Router pages under `apps/app/app/**/page.tsx`
- Route constants in `packages/contracts/src/constants/routes.constant.ts`
- Executable protected-route classification in
  `apps/app/src/lib/workspace-shell/workspace-shell-registry.ts`
- Protected/public page drift guard and public classification registry in
  `scripts/architecture/check-product-route-inventory.ts`
- Shell surface resolver in `apps/app/packages/components/useAppProtectedLayout.ts`
- Sidebar resolver in `apps/app/packages/components/AppProtectedLayoutSidebar.tsx`
- App rail in `packages/ui/src/components/shell/app-rail/AppRail.tsx`, hosted by
  `apps/app/src/components/shell/AppProtectedRail.tsx` (#5304)

## App Rail Modules

The app rail is a module switcher, not a deep-page launcher.

Current primary modules:

- Workspace
- Agent
- Messages
- Research
- Library
- Publish
- Analytics

Every primary module except Workspace has an Admin module flag (#5468,
`PLATFORM_MODULE_FLAG_KEYS`), edited at `/admin/flags/modules` and on by
default. Off hides the rail entry, answers 404 on the module's routes and on
its `@FeatureFlag`-decorated API controllers; superadmins keep access for
inspection. Smaller product features use `/admin/flags/features`.

Remix is a contextual action tied to a specific finding, asset, post, or
content run rather than an app-switcher module. Admin is role-gated and can be
surfaced separately. Deep views like Discovery, Socials, Ads, Batch, Review,
Calendar, Scheduled, Post Analytics, Trend Analytics, and Repeat are internal
navigation or contextual actions, not app-switcher modules.

## Route families (regenerate, don't hand-copy)

Public/auth, onboarding, personal, organization-scope, brand-scope, and admin route lists all
come straight out of `apps/app/app/**/page.tsx` plus `routes.constant.ts` — run
`bun run check:route-inventory` for the current tree rather than trusting a hand-maintained copy
here. A few facts aren't visible from the route list alone and are worth keeping:

- `/:orgSlug/~/automate` is a real static page (cross-brand Automate overview, the destination for
  members with no brand selected); deeper `/:orgSlug/~/automate/*` paths redirect back to it
  because every other automation surface is brand-scoped.
- `/workflows*` is gone everywhere in `apps/app` — no page, no constant, no compatibility redirect.
  Automation lives under `/:orgSlug/:brandSlug/automate/workflows*`. In `apps/app/src/lib/api/*`,
  `/workflows` still means the **backend API** endpoint; that is unrelated and unchanged.
- `/:orgSlug/:brandSlug/library/assets` is the canonical Library landing — one unified asset
  browser. The other Library type routes (videos, images, gifs, avatars, voices, music, captions)
  are not separate sidebar modules; they're shareable deep links that seed the same browser with
  type chips pre-selected. A shelf is a saved query over generation state, not a location.
  `?view=grid|list|canvas` arranges the same filtered set three ways.
- Analytics owns every analytics surface — Publish has no `/publish/analytics` page of its own.
- The Agent is the single front door for one-off writing, including newsletter generation;
  Publish owns approval/scheduling/go-live, not a separate creation module.

## Review Notes

- `Messages` is intentionally a full app/module for global social engagement —
  comments + DMs as surfaces of one inbox (#2742); `SocialConversationType`
  also reserves `mention`/`reply` for later producers.
- `Remix` is not a top-level page concept. It is a contextual action inside
  Research, Publish, Analytics, Library, and authorized content-run outputs;
  `/publish/remix` remains a canonical Publish child route for typed handoffs.
- `Repeat` is not a top-level page concept. It should be a contextual feature/action inside Research, Publish, Analytics, Studio, or Library output views.
- `Discovery`, `Socials`, and `Ads` are Research internal pages.
- `Batch` is Studio internal navigation when the Studio capability is enabled.
- Creation starts in the Agent. Focused `/edit/:type/:id` artifact editors belong to Publish, while the Remotion project editor is Studio's `Edit` surface.
