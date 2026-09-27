---
description: Product feature switches live on Admin platform settings, never in env.
paths:
  - "packages/config/src/schemas/**"
  - "apps/server/*/src/config/config.service.ts"
  - "apps/server/api/src/collections/platform-settings/**"
---

# Product feature switches are Admin platform settings, not env

**last_verified: 2026-09-28** · Decision: https://github.com/genfeedai/genfeed.ai/issues/5407

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
