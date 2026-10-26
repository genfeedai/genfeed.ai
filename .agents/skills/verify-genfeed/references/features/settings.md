# Settings

## What exists
Org-scoped settings: profile, organization identity and settings, brands (detail, brand
interview, brand OS export), connections, credits (`billing-credits.md`), agent settings
(`/settings/agent`, with context, learning and receipts) and `/settings/agents`, plus a
settings command-navigation palette.

## How a user reaches it
Settings entry in the shell, or the org-scoped `/settings/...` URL.

## How to drive it
Specs under `playwright/e2e/tests/settings/`: `profile`, `organization-identity`,
`org-settings-interactions`, `brand-detail`, `brand-settings-interactions`,
`brand-interview`, `brand-os-export`, `connections`, `settings-command-navigation`,
`billing`, `cost-usage`. Page object: `settings.page.ts`, `brands.page.ts`.

## What usually breaks
- Org and brand slugs are per-run: the authed smoke derives them from the provisioned
  workspace; do not hardcode them.
- Connections list hits external platform status endpoints; mocked.
- Forms use shared primitives (`@ui/primitives/*`); selectors by role and label survive
  refactors, raw CSS selectors do not.
