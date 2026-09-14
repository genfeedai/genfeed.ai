packages: @genfeedai/contracts @genfeedai/helpers

Add `computeOutlierBaseline` to `@genfeedai/helpers` and the
`OutlierBaseline*` input, option, scope, provenance and result types to
`@genfeedai/contracts/interfaces` for the calculation contract in #4796.

The helper calculates a median from the newest eligible account posts and
returns per-post ratios, tiers and exclusion reasons. Callers supply the clock,
authorize and normalize their records, and handle `insufficient_data` and
`zero_baseline` results before using ratios. Invalid configuration, duplicate
post IDs and mixed account scopes throw `RangeError`.

This is an additive API; existing consumers require no migration. Persistence,
provider adapters and product integration remain owned by #4403.
