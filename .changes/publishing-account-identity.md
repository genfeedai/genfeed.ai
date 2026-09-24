packages: @genfeedai/props @genfeedai/contracts

Publishing account rows now accept connected-account identities, and platform
badges support solid brand-color markers.

- `props` `./publisher/publishing-overview.props`: health and cadence section
  props gain optional `connections`; `PublishingAccountRowProps` is added.
  Health and cadence row `platform` fields now use
  `AccountHealthSummary['platform']` instead of arbitrary strings. Consumers
  constructing these rows must supply a supported account-health platform.
- `props` `./ui/display/platform-badge.props`: `PlatformBadgeProps` gains
  optional `variant: 'subtle' | 'solid'`; omitting it preserves subtle styling.
- `contracts` `IPlatformBadgeConfig` gains required `solidBgColor`. Consumers
  constructing platform badge configs must provide the solid background class.

Existing section callers may omit `connections` to retain account-label fallback.
