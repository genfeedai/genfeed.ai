packages: @genfeedai/pages @genfeedai/props

Replace the per-platform card grid on brand Integrations settings with an
accounts table: one row per account (sorted by platform then name), with
Account / Platform / Status / Actions columns that collapse to stacked
cards on mobile, plus a searchable, category-grouped Connect account
modal.

- `pages`: new `./brands/components/integrations/{AccountsTable, AccountCell,
  AccountAvatar, AccountStatusBadge, AccountRowActionsMenu,
  ConnectAccountModal, account-connection-status.util}` exports. Consumers
  that want the accounts table (not just the compact sidebar summary) render
  `BrandDetailSocialMediaCard` with `variant="page"` rather than composing
  the deleted per-platform card row directly; the individual pieces above
  are exported for anywhere that needs just the avatar, status badge, or
  row-actions menu on their own. `account-connection-status.util` is the
  status source of truth (`getAccountConnectionStatus`, `isVisibleCredentialRow`,
  re-exported from `@genfeedai/ui`'s `ModalBrand.types`) — read from it
  instead of checking a credential's raw `isConnected` field, which no
  longer means "show as connected" on its own (a credential can be
  `isConnected: true` and still need reconnecting: no captured identity, or
  an expired token).
- `props`: new `./pages/brand-integrations.props` (`AccountsTableProps`,
  `AccountStatusBadgeProps`, `AccountRowActionsMenuProps`,
  `ConnectAccountModalProps`, `ConnectAccountPlatform`,
  `ConnectAccountPlatformGroup`, `AccountConnectionStatus`). `./pages/brand-detail.props`
  and `./pages/platform-home.props` widen existing connection/health shapes
  with the same `'needsReconnect'` status tier instead of a boolean
  connected flag.
