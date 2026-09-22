packages: @genfeedai/contracts @genfeedai/contracts/constants @genfeedai/config @genfeedai/serializers @genfeedai/prisma

Move typed-decision provider selection (#4908) from the environment to the
`/admin` platform-settings singleton.

- `@genfeedai/contracts` adds `TypedDecisionProviderName` (`'jev' | 'none'`) and
  narrows `TypedDecisionProvider.name`, `TypedDecisionTelemetryRecord.provider`
  and `TypedDecisionTelemetryProperties.provider` from `string` to it. Code that
  only reads those fields is unaffected; anything constructing one now has to
  use a known provider name.
- `@genfeedai/contracts/constants` adds `TYPED_DECISION_PROVIDER_LABELS`,
  `TYPED_DECISION_PROVIDER_NAMES`, `DEFAULT_TYPED_DECISION_PROVIDER` and
  `parseTypedDecisionProvider`, and `IPlatformSetting` /
  `IUpdatePlatformSettingPayload` gain `typedDecisionProvider`.
- `@genfeedai/config` **removes** `TYPED_DECISION_PROVIDER` from the AI schema
  and `IEnvConfig`. A deployment that still sets it is not broken — the key is
  simply ignored, and the stored setting (default `none`, matching the previous
  env default) decides. `TYPESAFE_API_KEY` and `TYPED_DECISION_TIMEOUT_MS` are
  unchanged: a credential and a per-call budget, not a product switch.
- `@genfeedai/serializers` serializes `typedDecisionProvider` on
  `PlatformSettingSerializer`.
- `@genfeedai/prisma` adds `PlatformSetting.typedDecisionProvider`
  (`TEXT NOT NULL DEFAULT 'none'`) with migration
  `20260921120000_platform_typed_decision_provider`.

Self-hosted installs need no action: the column defaults to `none`, which
resolves every typed decision to `null` without a network call.
