---
description: Product feature switches and module flags live on Admin platform settings, never in env or PostHog.
paths:
  - "packages/config/src/schemas/**"
  - "apps/server/*/src/config/config.service.ts"
  - "apps/server/api/src/collections/platform-settings/**"
  - "apps/server/api/src/feature-flag/**"
  - "packages/contracts/src/constants/feature-flags.constant.ts"
---

# Product feature switches are Admin platform settings, not env

**last_verified: 2026-09-28** · Decisions: https://github.com/genfeedai/genfeed.ai/issues/5407, https://github.com/genfeedai/genfeed.ai/issues/5468

Enabling a feature, a rollout mode (`off | shadow | live`), a confidence
threshold or any other operator decision about product behaviour is a typed
column on the `PlatformSetting` singleton, edited at
`/admin/administration/platform-settings` (superadmin + IP allowlist).

**Why:** an env switch changes only with a deploy by someone holding AWS/SSM
access; a kill switch that needs a deploy is not a kill switch.

**How to apply:**
- Add the column with a typed default, the field on `IPlatformFeatureSettings`,
  its fail-closed parse in `parsePlatformFeatureSettings`, the DTO validator, the
  serializer attribute and the admin control (next-intl copy).
- Read it with `PlatformSettingsService.getFeatureSettings()` per call or per
  sweep tick — cached 15s per process, replaced on write — never at module init.
- Env keeps secrets, keys, URLs and true infrastructure (`BETTER_AUTH_ENABLED`,
  `SENTRY_ENABLED`). `bun run check:env-product-flags` fails CI on a new
  `*_ENABLED` / `*_MODE` / `*_MIN_CONFIDENCE` / `*_THRESHOLDS` schema key outside
  its infrastructure allow-list.
- Module and feature on/off flags are the `flags` JSON on the same row
  (`PLATFORM_MODULE_FLAG_KEYS`, `PLATFORM_FEATURE_FLAG_KEYS`), edited at
  `/admin/flags/modules|features`, default on. Gate a controller with
  `@FeatureFlag('<key>')` (global guard → 404, superadmins pass); the app shell
  gates rail and routes from the same flags. Never evaluate product flags in
  PostHog and never add an env JSON of flag values (`*FEATURE_FLAG*` keys fail
  the check).
