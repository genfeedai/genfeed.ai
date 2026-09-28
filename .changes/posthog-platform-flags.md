packages: @genfeedai/contracts, @genfeedai/contracts/constants, @genfeedai/hooks, @genfeedai/libs, @genfeedai/prisma, @genfeedai/props, @genfeedai/serializers

Product switches are PostHog feature flags (#5468), not Platform Settings.
`@genfeedai/contracts` adds `PLATFORM_FEATURE_FLAG_KEYS`,
`PLATFORM_FEATURE_FLAG_DISTINCT_ID`, `platformFeatureSettingsFromFlags`,
`SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS`, `IPlatformFeatureFlagResult` and
`FEATURE_FLAG_OFFLINE_DEFAULTS`; `IPlatformSetting` and
`IUpdatePlatformSettingPayload` no longer carry the switches. `@genfeedai/prisma`
drops the #5407 switch columns from `PlatformSetting`, and the platform setting
serializer no longer exposes them. `@genfeedai/props` removes the admin
platform-settings field props. `@genfeedai/libs` drops `FEATURE_FLAG_DEFAULTS`,
and `@genfeedai/hooks` no longer reads `NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS`.
