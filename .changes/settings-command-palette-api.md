packages: @genfeedai/props @genfeedai/services

Fix the command palette hiding every command, including context-free ones,
on any route missing a brand segment (#4660). Default commands are now
registered in tiers by how much context is actually known instead of being
gated on org AND brand slugs both being present.

- `@genfeedai/props`: `SettingsSearchProps` is removed from
  `ui/settings-search/settings-search.props` (dead export, no remaining
  consumer).
- `@genfeedai/services`: `createSettingsCommands`/`createHelpCommands` are
  split into `createOrgHelpCommands` (org-scoped) and
  `createGeneralHelpCommands` (context-free). `createPersonalSettingsCommands`
  and `createOrgSettingsCommands` are removed entirely — those destinations
  (Personal/Organization Settings, Brand Management, Billing) navigated with
  a full page reload; the client-side settings catalog
  (`useSettingsCommandsRegistration`) now covers the same pages, and every
  other real settings page, via `router.push`. `createDefaultCommands` and
  `registerDefaultCommands` now take a single `CommandsOrgContext` object
  instead of positional `orgSlug`/`brandSlug` arguments.
