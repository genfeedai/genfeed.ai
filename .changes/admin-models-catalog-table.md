packages: @genfeedai/helpers, @genfeedai/pages, @genfeedai/props

Admin model catalog surfaces now share branded provider and category badge
helpers, and the models list defaults to an Active tab with All last.

`getModelCategoryBadgeClass`, `getModelProviderBadgeClass`, and
`getModelProviderLabel` live in `@genfeedai/helpers/ui/model-badge.helper`.
`ADMIN_MODEL_TYPE_TABS`, `AdminModelType`, `isAdminModelType`, and
`resolveAdminModelType` live on `@props/admin/models.props`.
