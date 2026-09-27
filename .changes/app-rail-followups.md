packages: @genfeedai/contracts @genfeedai/props @genfeedai/services @genfeedai/ui @genfeedai/hooks

Rename APP_SWITCHER_FEATURE_FLAGS / APP_SWITCHER_FEATURE_FLAG_KEYS and the
AppSwitcherFeatureFlagApp / AppSwitcherFeatureFlagKey types to APP_RAIL_* and
AppRail*. Consumers must update imports; deployed app_switcher_* PostHog keys
remain unchanged. No compatibility aliases are retained.

AppRailItemConfig now describes registry grouping, active roots, visibility,
brand-aware routes, and translation keys. AppRailProps adds a surface and typed
navigation-event callback. Shared rail navigation and component prop contracts
live in contracts and props.

createNavigationCommands now accepts resolved visible rail entries, localized
labels, a navigation callback, and a surface. Default commands no longer own
app navigation; the active rail registers these commands. Settings navigation
continues through the existing settings catalog.

The registry and keyboard helpers are shared by the rail, shortcuts and palette.
Workspace uses the existing unread-task count with a one-minute refresh interval;
Messages retains its scoped unread count. No backend endpoint or schema was added.

Remove useAdminCommandRegistration; visible Admin navigation now comes from the
rail registry and captures the same analytics as other app palette commands.
