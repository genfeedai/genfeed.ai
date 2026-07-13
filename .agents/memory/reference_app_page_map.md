---
name: app_page_map
description: Current app route/page map for QA review of app switcher, sidebars, org scope, brand scope, and admin surfaces.
type: reference
---

# App Page Map

Last audited: 2026-07-13.

Conversation-shell parity baseline: 206 canonical protected route patterns plus
two intentional hard-cut families. This file is the exact denominator owned by
`architecture/ADR-CONVERSATION-SHELL-CONTRACTS.md`; the app switcher is only a
discovery subset.

Source of truth:

- Next App Router pages under `apps/app/app/**/page.tsx`
- Route constants in `packages/constants/src/routes.constant.ts`
- Shell surface resolver in `apps/app/packages/components/useAppProtectedLayout.ts`
- Sidebar resolver in `apps/app/packages/components/AppProtectedLayoutSidebar.tsx`
- App switcher in `packages/ui/src/components/shell/app-switcher/AppSwitcher.tsx`

Regenerate the raw route list with:

```bash
rg --files apps/app/app | rg '/page\.(tsx|ts)$' | sort
```

## App Switcher Modules

The app switcher is a module switcher, not a deep-page launcher.

Current primary modules:

- Workspace
- Agent
- Messages
- Research
- Studio
- Remix
- Library
- Publish
- Analytics

Admin is role-gated and can be surfaced separately. Deep views like Discovery, Socials, Ads, Batch, Review, Calendar, Scheduled, Post Analytics, Trend Analytics, and Repeat are internal navigation or contextual actions, not app-switcher modules.

## Shell Surfaces

The protected shell currently recognizes these app contexts:

- `workspace`
- `agent`
- `messages`
- `research`
- `studio`
- `remix`
- `library`
- `posts`
- `analytics`
- `workflows`
- `compose`
- `editor`
- `admin`

Sidebar surfaces currently resolved by `AppProtectedLayoutSidebar`:

- Workspace
- Library
- Studio
- Admin
- Compose
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
- `/request-access`
- `/managed-credits/success`
- `/oauth/cli`
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
- `/settings`
- `/settings/help`

## Organization Scope Pages

Organization scope uses `/:orgSlug/~`.

Canonical explicit organization pages:

- `/:orgSlug`
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
- `/:orgSlug/~/studio`
- `/:orgSlug/~/studio/:type`
- `/:orgSlug/~/posts`
- `/:orgSlug/~/posts/published`
- `/:orgSlug/~/posts/scheduled`
- `/:orgSlug/~/write`
- `/:orgSlug/~/write/:segment`
- `/:orgSlug/~/compose`
- `/:orgSlug/~/compose/:segment`
- `/:orgSlug/~/workflows`
- `/:orgSlug/~/workflows/library`
- `/:orgSlug/~/workflows/templates`
- `/:orgSlug/~/workflows/executions`
- `/:orgSlug/~/workflows/new`
- `/:orgSlug/~/workflows/:id`
- `/:orgSlug/~/editor`
- `/:orgSlug/~/editor/projects`
- `/:orgSlug/~/editor/new`
- `/:orgSlug/~/editor/:id`

Hard cut:

- `/:orgSlug/~/workspace/*` is intentionally unsupported and returns 404. Do not add legacy redirects for this route family.
- `/:orgSlug/~/settings/organization/*` is intentionally unsupported and returns 404. Organization settings live directly under `/:orgSlug/~/settings/*`.

## Brand Scope Pages

Brand scope uses `/:orgSlug/:brandSlug`.

Workspace:

- `/:orgSlug/:brandSlug/workspace`
- `/:orgSlug/:brandSlug/workspace/overview`
- `/:orgSlug/:brandSlug/workspace/inbox/:view`
- `/:orgSlug/:brandSlug/workspace/activity`
- `/:orgSlug/:brandSlug/tasks`
- `/:orgSlug/:brandSlug/tasks/:id`
- `/:orgSlug/:brandSlug/overview/activities`

Agent:

- `/:orgSlug/:brandSlug/agent`
- `/:orgSlug/:brandSlug/agent/new`
- `/:orgSlug/:brandSlug/agent/:id`
- `/:orgSlug/:brandSlug/agent/journey`
- `/:orgSlug/:brandSlug/agent/onboarding`
- `/:orgSlug/:brandSlug/agent/onboarding/:threadId`

Messages:

- `/:orgSlug/:brandSlug/messages`

Research:

- `/:orgSlug/:brandSlug/research/discovery`
- `/:orgSlug/:brandSlug/research/following`
- `/:orgSlug/:brandSlug/research/socials`
- `/:orgSlug/:brandSlug/research/ads`
- `/:orgSlug/:brandSlug/research/ads/google`
- `/:orgSlug/:brandSlug/research/ads/meta`
- `/:orgSlug/:brandSlug/research/:platform`

Studio:

- `/:orgSlug/:brandSlug/studio/:type`
- `/:orgSlug/:brandSlug/studio/:type/:id`
- `/:orgSlug/:brandSlug/studio/batch`
- `/:orgSlug/:brandSlug/studio/clips`
- `/:orgSlug/:brandSlug/studio/fastlane`

Create/compose/editor:

- `/:orgSlug/:brandSlug/compose/article`
- `/:orgSlug/:brandSlug/compose/post`
- `/:orgSlug/:brandSlug/compose/newsletter`
- `/:orgSlug/:brandSlug/editor`
- `/:orgSlug/:brandSlug/editor/new`
- `/:orgSlug/:brandSlug/editor/:id`

Library:

- `/:orgSlug/:brandSlug/library/ingredients`
- `/:orgSlug/:brandSlug/library/videos`
- `/:orgSlug/:brandSlug/library/images`
- `/:orgSlug/:brandSlug/library/gifs`
- `/:orgSlug/:brandSlug/library/avatars`
- `/:orgSlug/:brandSlug/library/voices`
- `/:orgSlug/:brandSlug/library/music`
- `/:orgSlug/:brandSlug/library/captions`
- `/:orgSlug/:brandSlug/library/moodboard`

Publish/posts:

- `/:orgSlug/:brandSlug/posts`
- `/:orgSlug/:brandSlug/posts/:id`
- `/:orgSlug/:brandSlug/posts/analytics`
- `/:orgSlug/:brandSlug/posts/calendar`
- `/:orgSlug/:brandSlug/posts/composer`
- `/:orgSlug/:brandSlug/posts/newsletters`
- `/:orgSlug/:brandSlug/posts/published`
- `/:orgSlug/:brandSlug/posts/remix`
- `/:orgSlug/:brandSlug/posts/review`
- `/:orgSlug/:brandSlug/posts/scheduled`

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

Workflows and orchestration:

- `/:orgSlug/:brandSlug/workflows`
- `/:orgSlug/:brandSlug/workflows/new`
- `/:orgSlug/:brandSlug/workflows/:id`
- `/:orgSlug/:brandSlug/workflows/templates`
- `/:orgSlug/:brandSlug/workflows/executions`
- `/:orgSlug/:brandSlug/workflows/executions/:id`
- `/:orgSlug/:brandSlug/orchestration`
- `/:orgSlug/:brandSlug/orchestration/:agentId`
- `/:orgSlug/:brandSlug/orchestration/overview`
- `/:orgSlug/:brandSlug/orchestration/new`
- `/:orgSlug/:brandSlug/orchestration/analytics`
- `/:orgSlug/:brandSlug/orchestration/autopilot`
- `/:orgSlug/:brandSlug/orchestration/configuration`
- `/:orgSlug/:brandSlug/orchestration/hire`
- `/:orgSlug/:brandSlug/orchestration/orchestrator`
- `/:orgSlug/:brandSlug/orchestration/runs`
- `/:orgSlug/:brandSlug/orchestration/skills`
- `/:orgSlug/:brandSlug/orchestration/content-runs/:runId`
- `/:orgSlug/:brandSlug/orchestration/campaigns`
- `/:orgSlug/:brandSlug/orchestration/campaigns/new`
- `/:orgSlug/:brandSlug/orchestration/campaigns/:id`
- `/:orgSlug/:brandSlug/orchestration/outreach-campaigns`
- `/:orgSlug/:brandSlug/orchestration/outreach-campaigns/new`
- `/:orgSlug/:brandSlug/orchestration/outreach-campaigns/:id`
- `/:orgSlug/:brandSlug/orchestration/library`
- `/:orgSlug/:brandSlug/orchestration/library/:type`

Brand settings:

- `/:orgSlug/:brandSlug/settings`
- `/:orgSlug/:brandSlug/settings/voice`
- `/:orgSlug/:brandSlug/settings/harness`
- `/:orgSlug/:brandSlug/settings/interview`
- `/:orgSlug/:brandSlug/settings/publishing`
- `/:orgSlug/:brandSlug/settings/agent-defaults`

Lab/internal:

- `/:orgSlug/:brandSlug/lab/articles`
- `/:orgSlug/:brandSlug/lab/cron-jobs`
- `/:orgSlug/:brandSlug/lab/library-preview`
- `/:orgSlug/:brandSlug/lab/twitter-engage`

## Admin Pages

Admin root:

- `/admin`
- `/admin/agent`
- `/admin/agent/new`
- `/admin/agent/:threadId`

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

- `Messages` is intentionally a full app/module for global social DM.
- `Repeat` is not a top-level page concept. It should be a contextual feature/action inside Research, Publish, Analytics, Studio, or Library output views.
- `Discovery`, `Socials`, and `Ads` are Research internal pages.
- `Batch` is Studio internal navigation.
- `Compose` and `Editor` are creation/editor surfaces but should not appear as primary app-switcher modules unless product taxonomy changes.
