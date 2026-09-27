packages: @genfeedai/cli, @genfeedai/config, @genfeedai/contexts, @genfeedai/pricing, @genfeedai/props, @genfeedai/serializers, @genfeedai/services

BYOK is a Pro+ subscription feature and the metered BYOK platform fee is
removed. The CLI drops `credits summary` and `getCreditSummary`; config drops
`STRIPE_BYOK_FEE_PERCENTAGE` and `STRIPE_BYOK_FREE_THRESHOLD`; the access-state
context drops `isByok`; pricing drops `BYOK_FEE_*` and
`BYOK_FREE_THRESHOLD_CREDITS`, renames `BYOK_CREDIT_VALUE_DOLLARS` to
`CREDIT_VALUE_DOLLARS`, and adds the `byokAccess` entitlement with
`hasByokAccess()`; `ByokProviderCard` props require `canAddKey`; the
BYOK usage summary serializer and the `getByokUsageSummary` /
`createSetupCheckout` service methods are removed.
