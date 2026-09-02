packages: @genfeedai/contracts @genfeedai/contracts/interfaces @genfeedai/pages @genfeedai/props @genfeedai/serializers @genfeedai/services @genfeedai/ui

---

Review decisions now use the lowercase `unset`, `approved`, `rejected`, and
`request_changes` product contract. The existing uppercase Postgres labels are
retained behind the explicit `PersistedReviewDecision` compatibility mapping;
legacy nullable or uppercase reads normalize deterministically, and unknown
values fail closed to `unset`.
