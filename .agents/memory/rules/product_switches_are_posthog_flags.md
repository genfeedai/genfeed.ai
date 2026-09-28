---
description: Product feature switches are PostHog feature flags, never env and never a second flag system.
paths:
  - "packages/config/src/schemas/**"
  - "apps/server/*/src/config/config.service.ts"
  - "apps/server/api/src/feature-flag/**"
  - "packages/contracts/src/constants/platform-feature-settings.constant.ts"
---

# Product feature switches are PostHog feature flags

**last_verified: 2026-09-28** · Decisions: https://github.com/genfeedai/genfeed.ai/issues/5407 (out of env), https://github.com/genfeedai/genfeed.ai/issues/5468 (PostHog, not Platform Settings)

Enabling a feature, a rollout mode (`off | shadow | live`) or a confidence
threshold is a PostHog feature flag. Vincent (2026-09-28): "we use PostHog —
just use PostHog flags". No admin flags page, no Platform Settings columns, no
env JSON of flag values (`FEATURE_FLAG_DEFAULTS` is gone).

**How to apply:**
- Platform-wide switch: add a key to `PLATFORM_FEATURE_FLAG_KEYS`, a field to
  `IPlatformFeatureSettings` with its default in
  `DEFAULT_PLATFORM_FEATURE_SETTINGS`, and its mapping in
  `platformFeatureSettingsFromFlags` (boolean, variant, or JSON payload). Read it
  with `PlatformFeatureSettingsService.getFeatureSettings()` per call or per
  sweep tick — one PostHog request per process per 15s for the person
  `genfeed-platform`, never at module init.
- Per-user flag: `FeatureFlagService.isEnabled(key, { id: userId })` /
  `@FeatureFlag(key)`, with its offline default in `FEATURE_FLAG_OFFLINE_DEFAULTS`.
- Env keeps secrets, keys, URLs and true infrastructure (`BETTER_AUTH_ENABLED`,
  `SENTRY_ENABLED`). `bun run check:env-product-flags` fails CI on a new
  `*_ENABLED` / `*_MODE` / `*_MIN_CONFIDENCE` / `*_THRESHOLDS` / `*FEATURE_FLAG*`
  schema key outside its infrastructure allow-list.
- Creating or changing a production flag is a PostHog write: resolve the
  Genfeed EU project (192631) explicitly and get Vincent's go-ahead.
