packages: @genfeedai/contracts/constants @genfeedai/contracts

`resolveMusicSettings` and `normalizeMusicSettings` now accept `null` as well as
`undefined` for the music model key and fail closed (no durations, no lyrics,
no instrumental toggle) for any non-string value instead of relying on
truthiness. Valid keys resolve exactly as before.

No consumer change is required. Callers holding a nullable registry key no
longer need to coalesce it before the lookup.
