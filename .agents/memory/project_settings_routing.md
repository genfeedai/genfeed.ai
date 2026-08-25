---
name: project_settings_routing
description: Canonical settings route shapes for personal, organization, and brand scopes
type: project
status: active
last_verified: 2026-08-25
topics: [routing, settings, multitenancy, app-router]
---

# Settings Routing

**Why:** Settings pages exist at three distinct scopes. Brand settings must use the brand slug, not the internal brand id, so URLs remain semantic and stable across environments.

**How to apply:**

- Settings is a shell with nested pages, same pattern as Workspace → Overview.
- Personal settings home: `/settings/personal`. Bare `/settings` redirects there.
- Personal nested pages stay unscoped: `/settings/notifications`, `/settings/chat`, `/settings/progress`, `/settings/help`. Do not rewrite these onto `/:orgSlug/~/settings/*`.
- Organization settings home: `/:orgSlug/~/settings/general`. Bare `/:orgSlug/~/settings` redirects there.
- Org subpages append under org settings, e.g. `/:orgSlug/~/settings/api-keys`, `/:orgSlug/~/settings/billing`, `/:orgSlug/~/settings/members`
- Brand settings: `/:orgSlug/:brandSlug/settings`
- Brand subpages append under brand settings, e.g. `/:orgSlug/:brandSlug/settings/voice`, `/:orgSlug/:brandSlug/settings/publishing`, `/:orgSlug/:brandSlug/settings/agent-defaults`
- Do not generate brand settings URLs with `/settings/brands/:brandId`. Legacy routes can redirect for compatibility, but new links should use `brandSlug`.
- Use `hrefScope` on menu items when a config-level `/settings` href could mean personal, organization, or brand settings.
