packages: @genfeedai/config, @genfeedai/contracts, @genfeedai/contracts/constants, @genfeedai/prisma, @genfeedai/serializers, @genfeedai/props

Product feature switches move from env to Admin platform settings (#5407).
`@genfeedai/config` drops `mediaValidationSchema`, `modelDiscoveryDecisionSchema`
and every product-behaviour key (media perception/gates, moderation, typed-decision
modes and thresholds, agent compression/streaming, `SYSTEM_EVENTS_ENABLED_AT`,
`BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION`); stale values in a deployment's env are
ignored. `@genfeedai/contracts` adds `IPlatformFeatureSettings` (extended by
`IPlatformSetting` and `IUpdatePlatformSettingPayload`), `ShadowCappedDecisionMode`,
`DEFAULT_PLATFORM_FEATURE_SETTINGS`, `parsePlatformFeatureSettings`,
`parseModerationThresholdOverrides`, `TYPED_DECISION_MODES`,
`SHADOW_CAPPED_DECISION_MODES`, `MODERATION_PROVIDER_NAMES` and
`PLATFORM_FEATURE_SETTING_BOUNDS`. `PlatformSetting` gains the switch columns; the
migration carries production's values onto the existing singleton. The platform
setting serializer exposes the new fields.
