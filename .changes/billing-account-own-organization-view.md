packages: @genfeedai/contracts @genfeedai/serializers @genfeedai/client @genfeedai/hooks @genfeedai/services

`GET /billing-accounts/current` (`BillingAccountsService.getSnapshot`) exposed
every linked organization's label, budget and usage, plus the shared wallet
balance and subscription status, to any active member of any organization
linked to the billing account — `callerRole` only gated UI capability flags,
not the data itself (#5374).

- `IBillingAccount` gains a `kind: 'account'` discriminant.
- New `IBillingAccountOwnOrganizationView` (`kind: 'organization'`): the
  reduced view returned to a caller who is an active member of a linked
  organization but holds no `BillingAccountMember` role on the account —
  their own organization's usage, budget, and whether it's linked, and
  nothing else (no other linked organization's data, no wallet internals).
- New `IBillingAccountSnapshot = IBillingAccount | IBillingAccountOwnOrganizationView`
  union — `BillingAccountsService.getSnapshot`, the client
  `BillingAccountsService.getCurrent()`, and `useBillingAccount()` now return
  this union instead of `IBillingAccount` unconditionally. Consumers must
  branch on `kind` before reading `wallet`, `linkedOrganizations`, `label`,
  `status`, `subscriptionStatus`, or `currentPeriodEnd` — those fields do not
  exist on the reduced view.

Enforced in `BillingAccountsService.getSnapshot` itself (not only via
`capabilities`): a caller with no billing-account role never reaches the
queries that would return another linked organization's rows or the shared
wallet/subscription rows.
