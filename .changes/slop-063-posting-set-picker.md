packages: props, pages, ui

The scheduler and publisher now use one `PostingSetPickerProps` contract from
`@genfeedai/props/publisher/posting-set-picker.props` and one shared picker.
Its default select presentation remains unchanged. The cards presentation accepts
controlled save labels and preview/signature slots, preserving scheduler behavior.
The scheduler's service/container inputs are named `SchedulerPostingSetPickerProps`;
update imports of its old `PostingSetPickerProps` name. Unused scheduler-only
`PostingSetPickerListItem`, `PublishingPostingSetCreateInput` and
`PostingSetSignatureOption` declarations were removed.
