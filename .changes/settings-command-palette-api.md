packages: @genfeedai/props @genfeedai/services

Fix the command palette hiding every command, including context-free ones,
on any route missing a brand segment (#4660). Default commands are now
registered in tiers by how much context is actually known instead of being
gated on org AND brand slugs both being present.

- `@genfeedai/props`: `SettingsSearchProps` is removed from
  `ui/settings-search/settings-search.props` (dead export, no remaining
  consumer).
- `@genfeedai/services`: `createSettingsCommands`/`createHelpCommands` are
  split into `createPersonalSettingsCommands` (context-free),
  `createOrgSettingsCommands`/`createOrgHelpCommands` (org-scoped), and
  `createGeneralHelpCommands` (context-free). `createDefaultCommands` and
  `registerDefaultCommands` now take a single `CommandsOrgContext` object
  instead of positional `orgSlug`/`brandSlug` arguments.
