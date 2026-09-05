---
name: app_page_map
description: Current app route/page map for QA review of app switcher, sidebars, org scope, brand scope, and admin surfaces.
type: reference
---

# App Page Map

Last audited: 2026-07-27.

The current executable protected denominator is 216 canonical patterns. Two
intentional hard-cut families remain outside the denominator. The app switcher
is only a discovery subset.

Source of truth:

- Next App Router pages under `apps/app/app/**/page.tsx`
- Route constants in `packages/contracts/src/constants/routes.constant.ts`
- Executable protected-route classification in
  `apps/app/src/lib/workspace-shell/workspace-shell-registry.ts`
- Protected/public page drift guard and public classification registry in
  `scripts/architecture/check-product-route-inventory.ts`
- Shell surface resolver in `apps/app/packages/components/useAppProtectedLayout.ts`
- Sidebar resolver in `apps/app/packages/components/AppProtectedLayoutSidebar.tsx`
- App switcher in `packages/ui/src/components/shell/app-switcher/AppSwitcher.tsx`

The application registry mirrors all 216 parity-eligible patterns below and
keeps Notifications plus trusted pickers as explicit non-route surfaces. The
two hard-cut families remain outside it.

Regenerate the raw route list with:

```bash
bun run check:route-inventory
```

## App Switcher Modules

The app switcher is a module switcher, not a deep-page launcher.

Current primary modules:

- Workspace
- Agent
- Messages
- Research
- Library
- Publish
- Analytics

Every primary module has a display-only `app_switcher_*` PostHog flag. These
flags default off in SaaS and on for Desktop/self-hosted deployments. PostHog
identifies authenticated SaaS users by canonical `users.id` and targets
internal accounts through a non-PII `is_internal` person property. Display flags
never gate the underlying route, so hidden modules remain directly reachable
for testing. The separate `studio` capability flag remains available as a route
kill switch and defaults on.

Remix is a contextual action tied to a specific finding, asset, post, or
content run rather than an app-switcher module. Admin is role-gated and can be
surfaced separately. Deep views like Discovery, Socials, Ads, Batch, Review,
Calendar, Scheduled, Post Analytics, Trend Analytics, and Repeat are internal
navigation or contextual actions, not app-switcher modules.

## Shell Surfaces

The protected shell currently recognizes these app contexts:

- `workspace`
- `agent`
- `messages`
- `research`
- `studio`
- `library`
- `publish`
- `analytics`
- `workflows`
- `editor`
- `admin`

Sidebar surfaces currently resolved by `AppProtectedLayoutSidebar`:

- Workspace
- Library
- Studio
- Admin
- Workflows
- Editor
- Analytics
- Research
- Organization
- Settings

## Public/Auth Pages

- `/login`
- `/login/magic-link`
- `/login/password`
- `/logout`
- `/sign-up`
- `/sign-up/magic-link`
- `/forgot-password`
- `/reset-password`
- `/managed-credits/success`
- `/oauth/cli`
- `/oauth/consent`
- `/oauth/:platform`

## Onboarding Pages

- `/onboarding`
- `/onboarding/brand`
- `/onboarding/proactive`
- `/onboarding/providers`
- `/onboarding/summary`
- `/onboarding/success`
- `/onboarding/post-signup`

## Protected Personal/Root Pages

- `/`
- `/connect`
- `/settings`
- `/settings/help`

## Organization Scope Pages

Organization scope uses `/:orgSlug/~`.

Canonical explicit organization pages:

- `/:orgSlug`
- `/:orgSlug/~/connect`
- `/:orgSlug/~/overview`
- `/:orgSlug/~/analytics/overview`

Organization agent:

- `/:orgSlug/~/agent`
- `/:orgSlug/~/agent/new`
- `/:orgSlug/~/agent/:id`
- `/:orgSlug/~/agent/journey`
- `/:orgSlug/~/agent/onboarding`
- `/:orgSlug/~/agent/onboarding/:threadId`

Organization settings:

- `/:orgSlug/~/settings`
- `/:orgSlug/~/settings/personal`
- `/:orgSlug/~/settings/help`
- `/:orgSlug/~/settings/members`
- `/:orgSlug/~/settings/billing`
- `/:orgSlug/~/settings/credits`
- `/:orgSlug/~/settings/api-keys`
- `/:orgSlug/~/settings/webhooks`
- `/:orgSlug/~/settings/policy`
- `/:orgSlug/~/settings/brands`
- `/:orgSlug/~/settings/models`
- `/:orgSlug/~/settings/models/:type`
- `/:orgSlug/~/settings/elements/scenes`

Organization catch-all module pages served by `/:orgSlug/~/:orgRootApp/[[...segments]]`:

- `/:orgSlug/~/library`
- `/:orgSlug/~/library/:type`
- `/:orgSlug/~/publish`
- `/:orgSlug/~/publish/published`
- `/:orgSlug/~/publish/scheduled`
- `/:orgSlug/~/studio/edit`
- `/:orgSlug/~/studio/edit/projects`
- `/:orgSlug/~/studio/edit/new`
- `/:orgSlug/~/studio/edit/:id`

Automate at org scope is a real static page, not a catch-all module:

- `/:orgSlug/~/automate` — cross-brand Automate overview, the destination for members with
  no brand selected. Deeper `/:orgSlug/~/automate/*` paths redirect back to it, because every
  other automation surface is brand-scoped.

Hard cut:

- `/:orgSlug/~/workspace/*` is intentionally unsupported and returns 404. Do not add legacy redirects for this route family.
- `/workflows*` is gone everywhere in `apps/app` — no page, no constant, no compatibility redirect.
  Automation lives under `/:orgSlug/:brandSlug/automate/workflows*`. In `apps/app/src/lib/api/*`
  `/workflows` still means the **backend API** endpoint; that is unrelated and unchanged.
- `/:orgSlug/~/settings/organization/*` is intentionally unsupported and returns 404. Organization settings live directly under `/:orgSlug/~/settings/*`.

## Brand Scope Pages

Brand scope uses `/:orgSlug/:brandSlug`.

Workspace:

- `/:orgSlug/:brandSlug/workspace`
- `/:orgSlug/:brandSlug/workspace/overview`
- `/:orgSlug/:brandSlug/workspace/inbox/:view`
- `/:orgSlug/:brandSlug/workspace/activity`
- `/:orgSlug/:brandSlug/workspace/tasks`
- `/:orgSlug/:brandSlug/workspace/tasks/:id`
- `/:orgSlug/:brandSlug/overview/activities`

Legacy `/:orgSlug/:brandSlug/tasks` and
`/:orgSlug/:brandSlug/tasks/:id` links redirect to the corresponding canonical
Workspace paths above.

Agent:

- `/:orgSlug/:brandSlug/agent`
- `/:orgSlug/:brandSlug/agent/new`
- `/:orgSlug/:brandSlug/agent/:id`
- `/:orgSlug/:brandSlug/agent/journey`
- `/:orgSlug/:brandSlug/agent/onboarding`
- `/:orgSlug/:brandSlug/agent/onboarding/:threadId`

The Agent is the single front door for one-off writing, including newsletter
generation. Newsletter drafts open in the focused editor; Publish owns their
approval, scheduling, and go-live lifecycle, not a separate creation module.

Messages:

- `/:orgSlug/~/messages`
- `/:orgSlug/:brandSlug/messages`

Research:

- `/:orgSlug/~/research/discovery` (org entry: brand gate → brand research)
- `/:orgSlug/~/research/following`
- `/:orgSlug/~/research/socials`
- `/:orgSlug/~/research/ads`
- `/:orgSlug/~/research/ads/google`
- `/:orgSlug/~/research/ads/meta`
- `/:orgSlug/~/research/:platform`
- `/:orgSlug/:brandSlug/research/discovery`
- `/:orgSlug/:brandSlug/research/following`
- `/:orgSlug/:brandSlug/research/socials`
- `/:orgSlug/:brandSlug/research/ads`
- `/:orgSlug/:brandSlug/research/ads/google`
- `/:orgSlug/:brandSlug/research/ads/meta`
- `/:orgSlug/:brandSlug/research/:platform`

Studio:

- `/:orgSlug/:brandSlug/studio/generate`
- `/:orgSlug/:brandSlug/studio/storyboard`
- `/:orgSlug/:brandSlug/studio/batch`
- `/:orgSlug/:brandSlug/studio/clips`
- `/:orgSlug/:brandSlug/studio/fastlane`
- `/:orgSlug/:brandSlug/studio/edit`
- `/:orgSlug/:brandSlug/studio/edit/new`
- `/:orgSlug/:brandSlug/studio/edit/:id`

Focused artifact editing:

- `/:orgSlug/:brandSlug/edit/article/:id`
- `/:orgSlug/:brandSlug/edit/newsletter/:id`
- `/:orgSlug/:brandSlug/edit/post/:id`

Library:

- `/:orgSlug/:brandSlug/library/assets`
- `/:orgSlug/:brandSlug/library/recent`
- `/:orgSlug/:brandSlug/library/starred`
- `/:orgSlug/:brandSlug/library/trash`
- `/:orgSlug/:brandSlug/library/shelf/:shelf`
- `/:orgSlug/:brandSlug/library/videos`
- `/:orgSlug/:brandSlug/library/images`
- `/:orgSlug/:brandSlug/library/gifs`
- `/:orgSlug/:brandSlug/library/avatars`
- `/:orgSlug/:brandSlug/library/voices`
- `/:orgSlug/:brandSlug/library/music`
- `/:orgSlug/:brandSlug/library/captions`

`/:orgSlug/:brandSlug/library/assets` is the canonical Library landing — one
unified asset browser. Assets, Recent, Starred, Trash and `library/shelf/:shelf`
are navigation destinations. The retired tile-grid Overview
route (`/library/overview`) no longer resolves and redirects to Assets; it is
not part of the executable route set. The remaining Library type routes
(videos, images, gifs, avatars, voices, music, captions) are not separate
sidebar modules — they are shareable deep links that seed the same browser
with its type chips pre-selected, and the operator can widen or clear the
filter without leaving the page. A shelf is a saved query over generation
state, not a location; folder selection is a URL-backed secondary sidebar
filter layered on top of any of these destinations. `?view=grid|list|canvas`
arranges that same filtered set three ways; the canvas replaced the retired
`/library/moodboard` route, which no longer resolves.

Publish:

- `/:orgSlug/:brandSlug/publish`
- `/:orgSlug/:brandSlug/publish/:id`
- `/:orgSlug/:brandSlug/publish/calendar`
- `/:orgSlug/:brandSlug/publish/published`
- `/:orgSlug/:brandSlug/publish/remix`
- `/:orgSlug/:brandSlug/publish/review`
- `/:orgSlug/:brandSlug/publish/scheduled`

Legacy `/:orgSlug/:brandSlug/publish/newsletters` links permanently redirect to
`/:orgSlug/:brandSlug/agent/new`. The older `?id=<newsletterId>` shape resolves
directly to `/:orgSlug/:brandSlug/edit/newsletter/<newsletterId>` so saved
artifact links remain usable.

Analytics:

- `/:orgSlug/:brandSlug/analytics/overview`
- `/:orgSlug/:brandSlug/analytics/posts`
- `/:orgSlug/:brandSlug/analytics/brands`
- `/:orgSlug/:brandSlug/analytics/brands/:id`
- `/:orgSlug/:brandSlug/analytics/brands/:id/platforms/:platform`
- `/:orgSlug/:brandSlug/analytics/insights`
- `/:orgSlug/:brandSlug/analytics/hooks`
- `/:orgSlug/:brandSlug/analytics/performance-lab`
- `/:orgSlug/:brandSlug/analytics/trends`
- `/:orgSlug/:brandSlug/analytics/trends/detail/:id`
- `/:orgSlug/:brandSlug/analytics/trends/platforms/:platform`
- `/:orgSlug/:brandSlug/analytics/trend-turnover`
- `/:orgSlug/:brandSlug/analytics/streaks`

Analytics owns every analytics surface — the Publish module no longer has its
own `/publish/analytics` page. The sidebar groups these under **Performance**
(Overview, Posts, Brands) · **Intelligence** (Insights, Hooks, Performance Lab,
Trends, Trend Turnover) · **Habits** (Streaks); the `trends/detail` and
`trends/platforms` routes are drilldowns reached from Trends.

Workflows and automate:

- `/:orgSlug/:brandSlug/automate/workflows`
- `/:orgSlug/:brandSlug/automate/workflows/new`
- `/:orgSlug/:brandSlug/automate/workflows/:id`
- `/:orgSlug/:brandSlug/automate/workflows/templates`
- `/:orgSlug/:brandSlug/automate/workflows/executions`
- `/:orgSlug/:brandSlug/automate/workflows/executions/:id`
- `/:orgSlug/:brandSlug/automate`
- `/:orgSlug/:brandSlug/automate/:agentId`
- `/:orgSlug/:brandSlug/automate/overview`
- `/:orgSlug/:brandSlug/automate/new`
- `/:orgSlug/:brandSlug/automate/analytics`
- `/:orgSlug/:brandSlug/automate/autopilot`
- `/:orgSlug/:brandSlug/automate/configuration`
- `/:orgSlug/:brandSlug/automate/hire`
- `/:orgSlug/:brandSlug/automate/orchestrator`
- `/:orgSlug/:brandSlug/automate/runs`
- `/:orgSlug/:brandSlug/automate/skills`
- `/:orgSlug/:brandSlug/automate/content-runs`
- `/:orgSlug/:brandSlug/automate/content-runs/:runId`
- `/:orgSlug/:brandSlug/automate/campaigns` (Programs — agent coordination)
- `/:orgSlug/:brandSlug/automate/campaigns/new`
- `/:orgSlug/:brandSlug/automate/campaigns/:id`
- `/:orgSlug/:brandSlug/automate/library`
- `/:orgSlug/:brandSlug/automate/library/:type`

Messages (engagement + send-side sequences):

- `/:orgSlug/:brandSlug/messages`
- `/:orgSlug/:brandSlug/messages/outreach`
- `/:orgSlug/:brandSlug/messages/outreach/new`
- `/:orgSlug/:brandSlug/messages/outreach/:id`
- `/:orgSlug/:brandSlug/messages/replies`
- `/:orgSlug/:brandSlug/messages/reply-drip`

Brand settings:

- `/:orgSlug/:brandSlug/settings`
- `/:orgSlug/:brandSlug/settings/voice`
- `/:orgSlug/:brandSlug/settings/harness`
- `/:orgSlug/:brandSlug/settings/interview`
- `/:orgSlug/:brandSlug/settings/publishing`
- `/:orgSlug/:brandSlug/settings/agent-defaults`

## Admin Pages

Admin root:

- `/admin`

Admin overview:

- `/admin/overview/dashboard`
- `/admin/overview/activities`
- `/admin/overview/analytics/all`
- `/admin/overview/analytics/brands`
- `/admin/overview/analytics/brands/:id`
- `/admin/overview/analytics/brands/:id/platforms/:platform`
- `/admin/overview/analytics/business`
- `/admin/overview/analytics/organizations`
- `/admin/overview/analytics/organizations/:id`

Admin content:

- `/admin/content/posts`
- `/admin/content/posts/:id`
- `/admin/content/templates`
- `/admin/content/templates/:id`
- `/admin/content/prompts/list`
- `/admin/content/ingredients/:type`
- `/admin/folders`
- `/admin/images/:id`
- `/admin/videos/:id`

Admin automation:

- `/admin/automation/bots`
- `/admin/automation/models/:type`
- `/admin/automation/trainings`
- `/admin/automation/trainings/:id/images`
- `/admin/automation/trainings/:id/sources`
- `/admin/automation/workflows`

Admin configuration:

- `/admin/configuration/elements/blacklists`
- `/admin/configuration/elements/camera-movements`
- `/admin/configuration/elements/cameras`
- `/admin/configuration/elements/lenses`
- `/admin/configuration/elements/lightings`
- `/admin/configuration/elements/moods`
- `/admin/configuration/elements/scenes`
- `/admin/configuration/elements/sounds`
- `/admin/configuration/elements/styles`
- `/admin/configuration/font-families`
- `/admin/configuration/presets`
- `/admin/configuration/tags`
- `/admin/configuration/tags/:filter`

Admin fleet:

- `/admin/fleet/characters`
- `/admin/fleet/characters/:slug`
- `/admin/fleet/gallery`
- `/admin/fleet/generate`
- `/admin/fleet/infrastructure`
- `/admin/fleet/lip-sync`
- `/admin/fleet/pipeline`
- `/admin/fleet/training`
- `/admin/fleet/voices`

Admin library:

- `/admin/library/voices`

Admin organization/administration:

- `/admin/organization`
- `/admin/administration/users`
- `/admin/administration/warmup-accounts`
- `/admin/administration/roles`
- `/admin/administration/subscriptions`
- `/admin/administration/credit-usage`
- `/admin/administration/announcements`
- `/admin/administration/system-emails`
- `/admin/administration/platform-settings`

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
