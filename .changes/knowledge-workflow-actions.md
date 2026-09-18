packages: @genfeedai/actions @genfeedai/contracts @genfeedai/workflows @genfeedai/client @genfeedai/serializers @genfeedai/services @genfeedai/props

Expose Knowledge capture, search, list, read, archive, purpose, and retry
actions on the workflow surface, plus refresh/transcript fields on the
source record.

`CuratedActionSurface` now includes `workflow`. Workflow execution context
carries `brandId` and `isCustomerWorkflow`. Consumers compiling the action
catalog must accept the new Knowledge contracts and the `workflow` surface.
