packages: @genfeedai/client

`Brand.isSelected` is removed from the `Brand` client model — the ambiguous,
org-wide "selected" flag is replaced by a required per-member
`currentBrandId` invariant (#5219). `Member.currentBrandId` on the `Member`
client model is now a required `string` (was an optional `string | null`).
