packages: @genfeedai/contracts @genfeedai/props @genfeedai/ui

`ModalEnum.POST` is removed. #5174 replaced the post-create modal with a
full-page composer, and #5189 removed the last renderer that relied on the
default `modalId`. `ModalPost` keeps its edit/thread/long-form openers, but
`modalId` on `ModalPostProps` is now required instead of defaulting to the
removed enum member — every caller must pass an explicit `ModalEnum` value
(for example `ModalEnum.POST_LONG_FORM`).

The ingredient publish flow (`openIngredientModal` in
`use-ingredients-list/use-ingredients-actions`) routed on `ModalEnum.POST` as
an internal sentinel to trigger `openPostBatchModal`; it now routes on
`ModalEnum.POST_BATCH`, the batch modal's real id, which is what was actually
being opened.

`@genfeedai/props` adds `ModalPostBatchProps` (`ModalPostProps` without `modalId`) for the batch publish modal, which always renders as `ModalEnum.POST_BATCH`.
