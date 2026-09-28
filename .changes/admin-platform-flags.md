packages: @genfeedai/contracts @genfeedai/contracts/interfaces @genfeedai/serializers @genfeedai/hooks @genfeedai/services @genfeedai/props @genfeedai/ui

Product modules and features become Admin flags (#5468) stored on the
platform-settings row and edited at `/admin/flags/modules` and
`/admin/flags/features`. `@FeatureFlag` now takes a registered platform flag
key and is enforced by a global guard (404 when off, superadmins pass); the
app rail, module routes and `useFeatureFlag` read the same flags from the new
`GET /public/platform-flags`. PostHog flag evaluation, `FEATURE_FLAG_DEFAULTS`,
`NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS` and `subscribeAnalyticsFeatureFlags` are
removed; `app_switcher_*` keys become module keys and `moodboard` becomes
`library_canvas`.
